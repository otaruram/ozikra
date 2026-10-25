package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
	"ozik-sentinel-backend/internal/models"
)

type PDFService struct{}

func NewPDFService() *PDFService {
	return &PDFService{}
}

// SanitizeMilitaryText cleans raw LLM output, strips Markdown artifacts, and fixes broken encoding glyphs
func SanitizeMilitaryText(rawText string) string {
	if rawText == "" {
		return ""
	}
	s := rawText

	// 1. Fix broken multi-byte encoding artifacts (UTF-8 decoded as CP1252/Latin-1)
	s = strings.ReplaceAll(s, "â€\"", " - ")
	s = strings.ReplaceAll(s, "â€¢", " - ")
	s = strings.ReplaceAll(s, "â€™", "'")
	s = strings.ReplaceAll(s, "â€œ", "\"")
	s = strings.ReplaceAll(s, "â€", "\"")

	// 2. Normalize unicode punctuation to standard ASCII for gofpdf / clean administrative output
	s = strings.ReplaceAll(s, "\u2014", " - ") // em-dash
	s = strings.ReplaceAll(s, "\u2013", " - ") // en-dash
	s = strings.ReplaceAll(s, "\u2022", " - ") // bullet
	s = strings.ReplaceAll(s, "\u201c", "\"")  // left double quote
	s = strings.ReplaceAll(s, "\u201d", "\"")  // right double quote
	s = strings.ReplaceAll(s, "\u2018", "'")   // left single quote
	s = strings.ReplaceAll(s, "\u2019", "'")   // right single quote
	s = strings.ReplaceAll(s, "\u2026", "...") // ellipsis

	// 3. Remove fenced code blocks
	reCodeBlock := regexp.MustCompile("(?s)```[a-zA-Z]*\\s*.*?```")
	s = reCodeBlock.ReplaceAllString(s, "")

	// 4. Remove inline backticks
	reInlineCode := regexp.MustCompile("`([^`]+)`")
	s = reInlineCode.ReplaceAllString(s, "$1")

	// 5. Remove Markdown headers (#, ##, ###, ####, etc.)
	reHeaders := regexp.MustCompile("(?m)^#{1,6}\\s+")
	s = reHeaders.ReplaceAllString(s, "")

	// 6. Remove bold and italic markers (**, *, __, _)
	reBold := regexp.MustCompile(`\*\*(.*?)\*\*`)
	s = reBold.ReplaceAllString(s, "$1")
	reItalic := regexp.MustCompile(`\*([^*]+)\*`)
	s = reItalic.ReplaceAllString(s, "$1")
	reBoldUnder := regexp.MustCompile(`__(.*?)__`)
	s = reBoldUnder.ReplaceAllString(s, "$1")
	reItalicUnder := regexp.MustCompile(`_([^_]+)_`)
	s = reItalicUnder.ReplaceAllString(s, "$1")

	// 7. Remove strikethrough (~~text~~)
	reStrike := regexp.MustCompile(`~~(.*?)~~`)
	s = reStrike.ReplaceAllString(s, "$1")

	// 8. Normalize raw bullet dashes/asterisks at line starts
	reBullets := regexp.MustCompile(`(?m)^[\*\-\+]\s+`)
	s = reBullets.ReplaceAllString(s, "  - ")

	// 9. Remove standalone AI markdown dashes
	reDashes := regexp.MustCompile(`\s+--\s+`)
	s = reDashes.ReplaceAllString(s, " - ")

	// 10. Normalize consecutive newlines and trim
	reNewlines := regexp.MustCompile(`\n{3,}`)
	s = reNewlines.ReplaceAllString(s, "\n\n")

	return strings.TrimSpace(s)
}

func (p *PDFService) GenerateBAPReportHTML(report models.ForensicReport, asset models.Asset) string {
	nowStr := time.Now().Format("02 January 2006")
	sealTime := time.Now().Format("2006-01-02 15:04:05")

	h := sha256.New()
	h.Write([]byte(report.InvestigationID + report.AssetID + sealTime))
	evidenceSeal := hex.EncodeToString(h.Sum(nil))

	isolationStatus := "DALAM PENANGANAN OPERASIONAL"
	if report.Isolated {
		isolationStatus = "TERISOLASI FISIK (AIR-GAP RELAY CUT & SAFETY LOCK)"
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>BERITA ACARA PEMERIKSAAN FORENSIK SIBER - %s</title>
<style>
  @page { size: A4; margin: 20mm; }
  body {
    font-family: 'Times New Roman', Times, serif;
    margin: 30px auto;
    max-width: 800px;
    color: #111;
    line-height: 1.5;
    background: #fff;
  }
  .kop {
    text-align: center;
    border-bottom: 3px double #000;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }
  .kop-instansi { font-size: 13px; font-weight: bold; letter-spacing: 2px; }
  .kop-satuan { font-size: 16px; font-weight: 900; letter-spacing: 1.5px; }
  .kop-sub { font-size: 10px; font-family: Arial, sans-serif; margin-top: 3px; color: #333; }
  .badge-rahasia {
    display: inline-block;
    border: 1px solid #000;
    padding: 2px 12px;
    font-family: monospace;
    font-size: 11px;
    font-weight: bold;
    margin-top: 6px;
    letter-spacing: 1px;
  }
  .doc-title { text-align: center; margin: 25px 0 15px 0; }
  .doc-title h2 { text-decoration: underline; margin: 0; font-size: 17px; letter-spacing: 1px; }
  .doc-title .nomor { font-family: monospace; font-size: 12px; margin-top: 4px; }
  .preamble { font-size: 12px; text-align: justify; margin-bottom: 15px; }
  .section-h { font-size: 13px; font-weight: bold; margin-top: 18px; margin-bottom: 6px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; }
  table.meta-table { width: 100%%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
  table.meta-table td { padding: 6px 10px; border: 1px solid #444; }
  table.meta-table td.label { width: 35%%; background: #f4f4f4; font-weight: bold; }
  .rca-box {
    background: #fafafa;
    border: 1px solid #ccc;
    padding: 12px;
    font-family: monospace;
    font-size: 11px;
    line-height: 1.6;
    white-space: pre-wrap;
    margin-bottom: 15px;
  }
  .timeline-list { font-size: 11.5px; margin-bottom: 15px; font-family: Arial, sans-serif; }
  .timeline-item { border-left: 2px solid #000; padding-left: 10px; margin-bottom: 8px; }
  .seal-card {
    border: 2px dashed #000;
    padding: 12px;
    margin: 20px 0;
    font-family: monospace;
    font-size: 10.5px;
    background: #f9f9f9;
  }
  .signatures {
    margin-top: 40px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    text-align: center;
  }
  .sig-col { width: 45%%; }
  .sig-space { height: 60px; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 10px; color: #888; }
</style>
</head>
<body onload="if(window.location.search.includes('print=true')) window.print()">

<div class="kop">
  <div class="kop-instansi">TENTARA NASIONAL INDONESIA ANGKATAN DARAT</div>
  <div class="kop-satuan">PUSAT SIBER TNI ANGKATAN DARAT (PUSSIBERAD)</div>
  <div class="kop-sub">KOMANDO TANGGAP INSIDEN KRITIS & INVESTIGASI RANTAI PASOK PERTAHANAN (CSIRT-AD)</div>
  <div class="badge-rahasia">KLASIFIKASI: SANGAT RAHASIA / OPERASIONAL SIBER</div>
</div>

<div class="doc-title">
  <h2>BERITA ACARA PEMERIKSAAN FORENSIK SIBER (BAPFS)</h2>
  <div class="nomor">Nomor: BAPFS / %s / CSIRT-AD / X / 2026 / PUSSIBERAD</div>
</div>

<div class="preamble">
  Pada hari ini, tanggal <strong>%s</strong>, bertempat di Markas Komando Pusat Siber TNI Angkatan Darat, telah dilakukan audit investigasi forensik digital otomatis dan verifikasi integritas rantai pasok alutsista oleh Satuan Tugas <strong>OZIK-SENTINEL</strong> terhadap modul perangkat pertahanan dengan rincian sebagai berikut:
</div>

<div class="section-h">I. IDENTITAS NODUS ALUTSISTA TERDAMPAK</div>
<table class="meta-table">
  <tr><td class="label">Nomor Investigasi</td><td><strong>%s</strong></td></tr>
  <tr><td class="label">ID & Nama Aset</td><td><strong>%s</strong> — %s</td></tr>
  <tr><td class="label">Nomor Seri / Pabrikan</td><td>%s / %s</td></tr>
  <tr><td class="label">Klasifikasi Perangkat</td><td>%s (Operational Technology / Defense Hardware)</td></tr>
  <tr><td class="label">Baseline Firmware Terdaftar</td><td><code>%s</code></td></tr>
  <tr><td class="label">Status Isolasi (Kill-Switch)</td><td><strong>%s</strong></td></tr>
  <tr><td class="label">Tingkat Keyakinan AI Engine</td><td><strong>%.0f%%</strong> (Ozik-Omni Multi-Phase Reasoning Model)</td></tr>
</table>

<div class="section-h">II. KRONOLOGI SERANGAN & BUKTI RANTAI PASOK</div>
<div class="timeline-list">
  <div class="timeline-item">
    <strong>[FASE 01 - SUPPLY CHAIN]</strong> Baseline Pengadaan &amp; QR Seal: Terdaftar resmi dengan sertifikat kepatuhan DO-178C &amp; MIL-STD-810H.
  </div>
  <div class="timeline-item">
    <strong>[FASE 02 - SIEM BREACH]</strong> Zero-Trust Rule Breach: Terdeteksi perubahan hash konfigurasi firmware tanpa didahului validasi Tactical QR Maintenance Window resmi.
  </div>
  <div class="timeline-item">
    <strong>[FASE 03 - ANOMALY ATTRIBUTION]</strong> Deteksi Anomali: Modul sensor mencatat deviasi trafik dan overwrite partisi storage lokal secara tidak sah.
  </div>
</div>

<div class="section-h">III. ANALISIS AKAR MASALAH (ROOT CAUSE ANALYSIS)</div>
<div class="rca-box">
%s
</div>

<div class="section-h">IV. TINDAKAN PENANGGULANGAN TAKTIS WAJIB</div>
<ol style="font-size: 12px; padding-left: 20px;">
  <li>Mempertahankan status isolasi jaringan fisik (Hardware Relay Air-Gap) secara ketat.</li>
  <li>Mencabut hak akses sertifikat kriptografi nodus dari Master Tactical Registry.</li>
  <li>Melakukan pengujian integritas sirkuit fisik (Side-Channel & JTAG Audit) oleh Satuan Siber PUSSIBERAD.</li>
</ol>

<div class="seal-card">
  <strong>SEGEL KRIPTOGRAFI BUKTI FORENSIK DIGITAL (PUSSIBERAD PKI):</strong><br>
  SHA-256 Digest : %s<br>
  Audit Ledger    : IMMUTABLE_BLOCK_HASH_CHAINED_OK<br>
  Waktu Segel     : %s WIB
</div>

<div class="signatures">
  <div class="sig-col">
    Auditor Forensik Siber Militer,<br><br>
    <div class="sig-space">[ TANDA TANGAN DIGITAL TERVERIFIKASI ]</div>
    <strong>LETTU CKE REZA ADITYA</strong><br>
    NRP 21190089201088
  </div>
  <div class="sig-col">
    Mengetahui,<br>Komandan Detasemen Forensik Siber,<br>
    <div class="sig-space">[ TERVALIDASI SISTEM OZIK-SENTINEL ]</div>
    <strong>KOLONEL CKE OZIKRA, S.T., M.Sc.</strong><br>
    NRP 11040019230876
  </div>
</div>

</body>
</html>`,
		report.InvestigationID,
		nowStr,
		report.InvestigationID,
		asset.ID, asset.Name,
		asset.SerialNumber, asset.Vendor,
		asset.Classification,
		asset.FirmwareHash,
		isolationStatus,
		report.Confidence*100,
		SanitizeMilitaryText(report.RootCauseMarkdown),
		evidenceSeal,
		sealTime,
	)
}

func (p *PDFService) GenerateBAPReportPDF(report models.ForensicReport, asset models.Asset) ([]byte, error) {
	nowStr := time.Now().Format("02 January 2006")
	sealTime := time.Now().Format("2006-01-02 15:04:05")

	h := sha256.New()
	h.Write([]byte(report.InvestigationID + report.AssetID + sealTime))
	evidenceSeal := hex.EncodeToString(h.Sum(nil))

	isolationStatus := "DALAM PENANGANAN OPERASIONAL"
	if report.Isolated {
		isolationStatus = "TERISOLASI FISIK (AIR-GAP RELAY CUT & SAFETY LOCK)"
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.SetAutoPageBreak(true, 15)
	pdf.AddPage()

	// Kop Surat
	pdf.SetFont("Times", "B", 11)
	pdf.CellFormat(0, 5, "TENTARA NASIONAL INDONESIA ANGKATAN DARAT", "", 1, "C", false, 0, "")
	pdf.SetFont("Times", "B", 13)
	pdf.CellFormat(0, 6, "PUSAT SIBER TNI ANGKATAN DARAT (PUSSIBERAD)", "", 1, "C", false, 0, "")
	pdf.SetFont("Arial", "", 8)
	pdf.CellFormat(0, 4, "KOMANDO TANGGAP INSIDEN KRITIS & INVESTIGASI RANTAI PASOK ALUTSISTA (CSIRT-AD)", "", 1, "C", false, 0, "")

	// Double line
	y := pdf.GetY() + 2
	pdf.SetLineWidth(0.8)
	pdf.Line(15, y, 195, y)
	pdf.SetLineWidth(0.2)
	pdf.Line(15, y+1, 195, y+1)
	pdf.SetY(y + 3)

	// Badge Klasifikasi
	pdf.SetFont("Courier", "B", 8)
	pdf.SetFillColor(240, 240, 240)
	pdf.CellFormat(0, 5, "[ KLASIFIKASI: SANGAT RAHASIA / OPERASIONAL SIBER MILITER ]", "1", 1, "C", true, 0, "")
	pdf.Ln(3)

	// Judul Dokumen
	pdf.SetFont("Times", "B", 13)
	pdf.CellFormat(0, 6, "BERITA ACARA PEMERIKSAAN FORENSIK SIBER (BAPFS)", "", 1, "C", false, 0, "")
	pdf.SetFont("Courier", "", 9)
	pdf.CellFormat(0, 5, fmt.Sprintf("Nomor: BAPFS / %s / CSIRT-AD / X / 2026 / PUSSIBERAD", report.InvestigationID), "", 1, "C", false, 0, "")
	pdf.Ln(2)

	// Preamble
	pdf.SetFont("Times", "", 10)
	preamble := fmt.Sprintf("Pada hari ini, tanggal %s, bertempat di Markas Komando Pusat Siber TNI Angkatan Darat, telah dilakukan audit investigasi forensik digital dan verifikasi integritas rantai pasok alutsista oleh Satuan Tugas OZIK-SENTINEL terhadap perangkat pertahanan dengan rincian data sebagai berikut:", nowStr)
	pdf.MultiCell(0, 4.5, preamble, "", "J", false)
	pdf.Ln(2)

	// Section I
	pdf.SetFont("Times", "B", 10)
	pdf.SetFillColor(230, 230, 230)
	pdf.CellFormat(0, 5.5, "I. IDENTITAS NODUS ALUTSISTA TERDAMPAK", "1", 1, "L", true, 0, "")
	pdf.SetFont("Times", "", 9)

	meta := [][]string{
		{"Nomor Investigasi", report.InvestigationID},
		{"ID & Nama Aset", fmt.Sprintf("%s - %s", asset.ID, asset.Name)},
		{"Nomor Seri / Vendor", fmt.Sprintf("%s / %s", asset.SerialNumber, asset.Vendor)},
		{"Klasifikasi Nodus", fmt.Sprintf("%s (Operational Technology / Defense Hardware)", asset.Classification)},
		{"Baseline Firmware", asset.FirmwareHash},
		{"Status Isolasi (Kill-Switch)", isolationStatus},
		{"Tingkat Keyakinan AI", fmt.Sprintf("%.0f%% (Ozik-Omni Multi-Phase Reasoning Model)", report.Confidence*100)},
	}

	for _, row := range meta {
		pdf.SetFont("Times", "B", 8.5)
		pdf.CellFormat(55, 5, row[0], "1", 0, "L", false, 0, "")
		pdf.SetFont("Times", "", 8.5)
		pdf.CellFormat(125, 5, row[1], "1", 1, "L", false, 0, "")
	}
	pdf.Ln(2)

	// Section II
	pdf.SetFont("Times", "B", 10)
	pdf.CellFormat(0, 5.5, "II. KRONOLOGI SERANGAN & BUKTI RANTAI PASOK MULTI-FASE", "1", 1, "L", true, 0, "")
	pdf.SetFont("Times", "", 8.5)
	timeline := []string{
		"[FASE 01 - SUPPLY CHAIN] Baseline Pengadaan & QR Seal terdaftar resmi dengan sertifikat kepatuhan standar DO-178C dan MIL-STD-810H.",
		"[FASE 02 - SIEM BREACH] Zero-Trust Rule Breach: Terdeteksi perubahan hash firmware tanpa diawali pembukaan Tactical QR Maintenance Window resmi.",
		"[FASE 03 - ANOMALY ATTRIBUTION] Deteksi Anomali: Modul sensor mencatat deviasi trafik dan anomali telemetri secara berkelanjutan.",
	}
	for _, t := range timeline {
		pdf.MultiCell(0, 4.2, "- "+SanitizeMilitaryText(t), "", "L", false)
	}
	pdf.Ln(2)

	// Section III
	pdf.SetFont("Times", "B", 10)
	pdf.CellFormat(0, 5.5, "III. ANALISIS AKAR MASALAH (ROOT CAUSE ANALYSIS)", "1", 1, "L", true, 0, "")
	pdf.SetFont("Courier", "", 8)
	pdf.SetFillColor(250, 250, 250)
	cleanRCA := SanitizeMilitaryText(report.RootCauseMarkdown)
	if cleanRCA == "" {
		cleanRCA = "Firmware hash mismatch terdeteksi pada controller bus alutsista tanpa otorisasi QR fisik resmi."
	}
	pdf.MultiCell(0, 4, cleanRCA, "1", "L", true)
	pdf.Ln(2)

	// Section IV
	pdf.SetFont("Times", "B", 10)
	pdf.CellFormat(0, 5.5, "IV. TINDAKAN PENANGGULANGAN TAKTIS WAJIB", "1", 1, "L", true, 0, "")
	pdf.SetFont("Times", "", 8.5)
	actions := []string{
		"1. Mempertahankan status isolasi jaringan fisik (Hardware Relay Air-Gap & Safety Lock) secara ketat.",
		"2. Mencabut hak akses sertifikat kriptografi nodus dari Master Tactical Registry.",
		"3. Melakukan inspeksi fisik mikrosirkuit (Side-Channel & JTAG Hardware Audit) oleh Satuan Siber PUSSIBERAD.",
	}
	for _, a := range actions {
		pdf.MultiCell(0, 4.2, SanitizeMilitaryText(a), "", "L", false)
	}
	pdf.Ln(2)

	// Segel Kriptografi
	pdf.SetFont("Courier", "B", 8)
	pdf.SetFillColor(245, 245, 245)
	sealText := fmt.Sprintf("SEGEL KRIPTOGRAFI BUKTI FORENSIK DIGITAL (PUSSIBERAD PKI):\nSHA-256 Digest : %s\nAudit Ledger   : IMMUTABLE_BLOCK_HASH_CHAINED_OK\nWaktu Segel    : %s WIB", evidenceSeal, sealTime)
	pdf.MultiCell(0, 4, sealText, "1", "L", true)
	pdf.Ln(4)

	// Tanda Tangan
	pdf.SetFont("Times", "", 9)
	pdf.CellFormat(90, 4, "Auditor Forensik Siber Militer,", "", 0, "C", false, 0, "")
	pdf.CellFormat(90, 4, "Mengetahui,", "", 1, "C", false, 0, "")
	pdf.CellFormat(90, 4, "", "", 0, "C", false, 0, "")
	pdf.CellFormat(90, 4, "Komandan Detasemen Forensik Siber,", "", 1, "C", false, 0, "")

	pdf.SetFont("Courier", "I", 7.5)
	pdf.CellFormat(90, 10, "[ TANDA TANGAN DIGITAL TERVERIFIKASI ]", "", 0, "C", false, 0, "")
	pdf.CellFormat(90, 10, "[ TERVALIDASI SISTEM OZIK-SENTINEL ]", "", 1, "C", false, 0, "")

	pdf.SetFont("Times", "B", 9)
	pdf.CellFormat(90, 4, "LETTU CKE REZA ADITYA", "", 0, "C", false, 0, "")
	pdf.CellFormat(90, 4, "KOLONEL CKE OZIKRA, S.T., M.Sc.", "", 1, "C", false, 0, "")

	pdf.SetFont("Times", "", 8)
	pdf.CellFormat(90, 4, "NRP 21190089201088", "", 0, "C", false, 0, "")
	pdf.CellFormat(90, 4, "NRP 11040019230876", "", 1, "C", false, 0, "")

	var buf bytes.Buffer
	err := pdf.Output(&buf)
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

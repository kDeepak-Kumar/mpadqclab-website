<?php
/* Receives website enquiries (JSON POST) → emails mpadqclab@gmail.com, sends auto-reply, keeps a CSV backup. */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
$cfg = require __DIR__ . '/config.php';

function out(int $code, array $body): void { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; }
function clean(string $s, int $max = 2000): string { $s = trim(str_replace(["\r\n", "\r"], "\n", $s)); $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? ''; return mb_substr($s, 0, $max); }
function oneline(string $s, int $max = 200): string { return clean(preg_replace('/\s+/', ' ', $s) ?? '', $max); }
function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['ok' => false, 'error' => 'Method not allowed.']);

$raw = file_get_contents('php://input') ?: '';
$in = json_decode($raw, true);
if (!is_array($in)) $in = $_POST;

// Spam traps: hidden field must be empty; form must take >3 seconds to fill
if (!empty($in['website'])) out(200, ['ok' => true, 'ref' => 'MPAD-' . date('ymd') . '-0000']);
$elapsed = (int)($in['elapsed'] ?? 0);   // ms the visitor spent on the form (measured in their browser)
if ($elapsed < 3000) out(429, ['ok' => false, 'error' => 'That was very quick — please wait a moment and try again.']);

// Rate limit: 6 enquiries per hour per IP
$store = __DIR__ . '/storage';
if (!is_dir($store)) @mkdir($store, 0750, true);
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$rlFile = $store . '/rate-' . md5($ip) . '.log';
$hits = array_filter(array_map('intval', @file($rlFile, FILE_IGNORE_NEW_LINES) ?: []), fn($t) => $t > time() - 3600);
if (count($hits) >= 6) out(429, ['ok' => false, 'error' => 'Too many enquiries from your connection. Please call or WhatsApp us.']);

$types = ['General enquiry', 'Request a quote', 'Consultation booking'];
$type    = in_array($in['enquiry_type'] ?? '', $types, true) ? $in['enquiry_type'] : 'General enquiry';
$name    = oneline((string)($in['name'] ?? ''), 80);
$phone   = oneline((string)($in['phone'] ?? ''), 20);
$email   = oneline((string)($in['email'] ?? ''), 120);
$company = oneline((string)($in['company'] ?? ''), 120);
$service = oneline((string)($in['service'] ?? ''), 80);
$loc     = oneline((string)($in['location'] ?? ''), 120);
$msg     = clean((string)($in['message'] ?? ''), 3000);
$pdate   = oneline((string)($in['preferred_date'] ?? ''), 10);
$ptime   = oneline((string)($in['preferred_time'] ?? ''), 40);
$pmode   = oneline((string)($in['consult_mode'] ?? ''), 40);
$page    = oneline((string)($in['page'] ?? ''), 200);

$err = [];
if (mb_strlen($name) < 2) $err['name'] = 'Please enter your name.';
$digits = preg_replace('/^(\+?91|0)/', '', preg_replace('/[\s\-()]/', '', $phone) ?? '') ?? '';
if (!preg_match('/^[6-9]\d{9}$/', $digits)) $err['phone'] = 'Enter a valid 10-digit mobile number.';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $err['email'] = 'Enter a valid email address.';
if (mb_strlen($msg) < 10) $err['message'] = 'Please describe your requirement (at least 10 characters).';
if ($type === 'Consultation booking') {
  $d = DateTime::createFromFormat('Y-m-d', $pdate);
  if (!$d || $d->format('Y-m-d') !== $pdate) $err['preferred_date'] = 'Choose a preferred date.';
  if ($ptime === '') $err['preferred_time'] = 'Choose a preferred time slot.';
}
if (preg_match('/https?:\/\/.*https?:\/\//is', $msg) || substr_count(strtolower($msg), 'http') > 3) $err['message'] = 'Please remove links from your message.';
if ($err) out(422, ['ok' => false, 'error' => 'Please correct the highlighted fields.', 'fields' => $err]);

$phoneFmt = '+91 ' . substr($digits, 0, 5) . ' ' . substr($digits, 5);
$ref = 'MPAD-' . date('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));
$when = (new DateTime('now', new DateTimeZone('Asia/Kolkata')))->format('d M Y, h:i A');

// ---- Subject: clearly marks website enquiries --------------------------
$label = ['General enquiry' => 'General Enquiry', 'Request a quote' => 'Quote Request', 'Consultation booking' => 'Consultation Booking'][$type];
$subject = $cfg['subject_tag'] . ' ' . $label . ($service ? ' – ' . $service : '') . ' – ' . $name . ' (' . $ref . ')';

$rows = ['Enquiry type' => $type];
if ($service) $rows['Service'] = $service;
if ($type === 'Consultation booking') {
  $rows['Preferred date'] = $d->format('D, d M Y'); $rows['Preferred time'] = $ptime;
  if ($pmode) $rows['Consultation mode'] = $pmode;
}
if ($company) $rows['Company / project'] = $company;
if ($loc) $rows['Site location'] = $loc;

$wa = 'https://wa.me/91' . $digits . '?text=' . rawurlencode("Hello $name, this is MPAD QC Lab regarding your enquiry $ref.");
$mailto = 'mailto:' . $email . '?subject=' . rawurlencode('Re: ' . $label . ' ' . $ref);

/* ---------- e-mail layout: single column, table-based, inline styles (Gmail / iPhone / Outlook safe) ---------- */
function btn(string $href, string $label, string $bg, string $fg): string {
  return '<tr><td style="padding:0 0 10px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    . '<td align="center" bgcolor="' . $bg . '" style="border-radius:8px;background:' . $bg . '">'
    . '<a href="' . h($href) . '" style="display:block;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:' . $fg . ';text-decoration:none;border-radius:8px">' . h($label) . '</a>'
    . '</td></tr></table></td></tr>';
}
function shell(string $preheader, string $inner): string {
  return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>'
    . '<body style="margin:0;padding:0;background:#f1efea">'
    . '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' . h($preheader) . '</div>'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1efea"><tr><td align="center" style="padding:20px 12px">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e3ded4">'
    . '<tr><td style="background:#0d1a31;border-radius:12px 12px 0 0;padding:16px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#ffffff"><b style="color:#f2b01e;letter-spacing:1px">MPAD QC LAB</b></td></tr>'
    . $inner
    . '<tr><td style="padding:14px 22px;border-top:1px solid #eeeae2;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a94a6">MPAD QC Lab Private Limited · NABL accredited (ISO/IEC 17025:2017) · Hyderabad</td></tr>'
    . '</table></td></tr></table></body></html>';
}
$f = 'font-family:Arial,Helvetica,sans-serif;';
$detail = '';
foreach ($rows as $k => $v) $detail .= '<tr><td style="' . $f . 'padding:9px 0;border-bottom:1px solid #eeeae2;font-size:13px;color:#66748a;width:42%;vertical-align:top">' . h($k) . '</td><td style="' . $f . 'padding:9px 0;border-bottom:1px solid #eeeae2;font-size:14px;color:#0d1a31;font-weight:bold;vertical-align:top">' . h($v) . '</td></tr>';
$inner = '<tr><td style="padding:22px 22px 6px 22px;' . $f . '">'
  . '<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#c98d06;font-weight:bold">New ' . h(strtolower($label)) . ' · ' . h($ref) . '</div>'
  . '<div style="font-size:22px;font-weight:bold;color:#0d1a31;margin-top:6px">' . h($name) . '</div>'
  . '<div style="font-size:15px;color:#0d1a31;margin-top:6px"><a href="tel:+91' . h($digits) . '" style="color:#1f3a6e;text-decoration:none">' . h($phoneFmt) . '</a></div>'
  . '<div style="font-size:15px;margin-top:2px"><a href="mailto:' . h($email) . '" style="color:#1f3a6e;text-decoration:none">' . h($email) . '</a></div>'
  . '</td></tr>'
  . '<tr><td style="padding:12px 22px 0 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' . $detail . '</table></td></tr>'
  . '<tr><td style="padding:18px 22px 4px 22px;' . $f . 'font-size:13px;color:#66748a;text-transform:uppercase;letter-spacing:1px;font-weight:bold">Requirement</td></tr>'
  . '<tr><td style="padding:0 22px"><div style="' . $f . 'font-size:15px;line-height:1.5;color:#0d1a31;background:#f6f4f0;border-left:4px solid #f2b01e;padding:12px 14px;border-radius:4px;white-space:pre-wrap">' . nl2br(h($msg)) . '</div></td></tr>'
  . '<tr><td style="padding:20px 22px 6px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
  . btn('tel:+91' . $digits, 'Call ' . $phoneFmt, '#f2b01e', '#0d1a31')
  . btn($wa, 'Reply on WhatsApp', '#1fa855', '#ffffff')
  . btn($mailto, 'Reply by email', '#0d1a31', '#ffffff')
  . '</table></td></tr>'
  . '<tr><td style="padding:4px 22px 18px 22px;' . $f . 'font-size:12px;color:#8a94a6">Received ' . h($when) . ' IST from ' . h($page ?: '/') . '</td></tr>';
$html = shell($label . ' from ' . $name . ' – ' . ($service ?: 'website'), $inner);

$text = "New website " . strtolower($label) . " ($ref)\n\nName: $name\nPhone: $phoneFmt\nEmail: $email\n";
foreach ($rows as $k => $v) $text .= "$k: $v\n";
$text .= "\nRequirement:\n$msg\n\nCall: tel:+91$digits\nWhatsApp: $wa\nReceived: $when IST\n";

function send_mail(array $cfg, string $to, string $subject, string $html, string $text, ?string $replyTo): bool {
  $b = 'b' . bin2hex(random_bytes(8));
  $from = $cfg['from_email'];
  $headers = [
    'MIME-Version: 1.0',
    'From: =?UTF-8?B?' . base64_encode($cfg['from_name']) . '?= <' . $from . '>',
    'Content-Type: multipart/alternative; boundary="' . $b . '"',
    'Date: ' . date('r'),
    'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . substr(strrchr($from, '@'), 1) . '>',
    'X-Mailer: MPAD-Website',
  ];
  if ($replyTo) $headers[] = 'Reply-To: ' . $replyTo;
  $body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
        . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$b--";
  $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
  return @mail($to, $subj, $body, implode("\r\n", $headers), '-f' . $from);
}

$replyTo = '=?UTF-8?B?' . base64_encode($name) . '?= <' . $email . '>';
$sent = send_mail($cfg, $cfg['to_email'], $subject, $html, $text, $replyTo);

// Backup copy of every enquiry (cPanel → File Manager → api/storage/enquiries.csv)
$csv = $store . '/enquiries.csv';
$new = !file_exists($csv);
if ($fh = @fopen($csv, 'a')) {
  if ($new) fputcsv($fh, ['received', 'ref', 'type', 'service', 'name', 'phone', 'email', 'company', 'location', 'preferred_date', 'preferred_time', 'mode', 'message', 'page', 'mail_sent']);
  fputcsv($fh, [$when, $ref, $type, $service, $name, $phoneFmt, $email, $company, $loc, $pdate, $ptime, $pmode, $msg, $page, $sent ? 'yes' : 'NO']);
  fclose($fh);
}
@file_put_contents($rlFile, implode("\n", array_merge($hits, [time()])));

if (!$sent) out(500, ['ok' => false, 'error' => 'Our mail server did not accept the message.', 'ref' => $ref]);

if (!empty($cfg['auto_reply'])) {
  $ai = '<tr><td style="padding:22px;' . $f . 'font-size:15px;line-height:1.6;color:#0d1a31">'
    . '<p style="margin:0 0 12px">Dear ' . h($name) . ',</p>'
    . '<p style="margin:0 0 12px">Thank you for contacting <b>MPAD QC Lab</b>. We have received your ' . h(strtolower($label)) . ($service ? ' for <b>' . h($service) . '</b>' : '') . ' and our team will get back to you within one working day.</p>'
    . ($type === 'Consultation booking' ? '<p style="margin:0 0 12px">Requested slot: <b>' . h($rows['Preferred date'] . ', ' . $ptime) . '</b>. We will call you to confirm.</p>' : '')
    . '<p style="margin:0">Your reference number: <b>' . h($ref) . '</b></p></td></tr>'
    . '<tr><td style="padding:0 22px 12px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    . btn('tel:+919000219015', 'Call ' . $cfg['phone_display'], '#f2b01e', '#0d1a31')
    . btn('https://wa.me/' . $cfg['whatsapp'], 'Chat on WhatsApp', '#1fa855', '#ffffff')
    . '</table></td></tr>';
  $at = "Dear $name,\n\nThank you for contacting MPAD QC Lab. We have received your enquiry ($ref) and will get back to you within one working day.\n\nUrgent? Call {$cfg['phone_display']} or WhatsApp https://wa.me/{$cfg['whatsapp']}\n\nMPAD QC Lab Private Limited";
  send_mail($cfg, $email, 'We received your enquiry – MPAD QC Lab (' . $ref . ')', shell('Thank you for contacting MPAD QC Lab', $ai), $at, $cfg['to_email']);
}
out(200, ['ok' => true, 'ref' => $ref]);

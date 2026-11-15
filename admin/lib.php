<?php
/* MPAD QC LAB — admin vault helpers (storage, auth, 2FA). Not reachable from the web (see .htaccess). */
declare(strict_types=1);

function cfg(): array { static $c; return $c ??= require __DIR__ . '/config.php'; }
function vault(string $p = ''): string { return rtrim(cfg()['vault_dir'], '/') . ($p ? '/' . $p : ''); }
function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function now(): string { return (new DateTime('now', new DateTimeZone('Asia/Kolkata')))->format('d M Y, h:i A'); }

function vault_init(): void {
  foreach ([vault(), vault('files')] as $d) if (!is_dir($d)) { if (!@mkdir($d, 0700, true)) throw new RuntimeException('Cannot create vault folder ' . $d); }
  if (!file_exists(vault('.htaccess'))) file_put_contents(vault('.htaccess'), "Require all denied\n");
  if (!file_exists(vault('details.json'))) jsave('details.json', ['fields' => array_map(fn($l) => ['label' => $l, 'value' => ''], [
    'Legal name', 'GSTIN', 'PAN', 'TAN', 'CIN', 'Udyam / MSME number', 'NABL certificate number', 'Registered address',
    'Bank name & branch', 'Account number', 'IFSC'])]);
}

/* JSON storage with file locking */
function jload(string $f, $default = []) {
  $p = vault($f); if (!file_exists($p)) return $default;
  $fh = fopen($p, 'r'); flock($fh, LOCK_SH); $t = stream_get_contents($fh); flock($fh, LOCK_UN); fclose($fh);
  $j = json_decode((string)$t, true); return is_array($j) ? $j : $default;
}
function jsave(string $f, $data): void {
  $p = vault($f); $tmp = $p . '.' . bin2hex(random_bytes(4));
  file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
  chmod($tmp, 0600); rename($tmp, $p);
}
function audit(string $who, string $what): void {
  $line = json_encode(['t' => now(), 'u' => $who, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '', 'e' => $what], JSON_UNESCAPED_UNICODE) . "\n";
  file_put_contents(vault('activity.log'), $line, FILE_APPEND | LOCK_EX);
}
function audit_tail(int $n = 100): array {
  $p = vault('activity.log'); if (!file_exists($p)) return [];
  $lines = array_slice(file($p, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [], -$n);
  return array_reverse(array_map(fn($l) => json_decode($l, true) ?: [], $lines));
}

/* Users */
function users(): array { return jload('users.json', ['users' => []])['users']; }
function save_users(array $u): void { jsave('users.json', ['users' => array_values($u)]); }
function find_user(string $name): ?array { foreach (users() as $u) if (strcasecmp($u['u'], $name) === 0) return $u; return null; }
function update_user(string $name, callable $fn): void {
  $all = users(); foreach ($all as &$u) if (strcasecmp($u['u'], $name) === 0) $u = $fn($u); unset($u); save_users($all);
}
function valid_username(string $u): bool { return (bool)preg_match('/^[a-zA-Z0-9._-]{3,30}$/', $u); }
function password_problem(string $p, string $user = ''): ?string {
  if (strlen($p) < 10) return 'Password must be at least 10 characters.';
  if (!preg_match('/[A-Za-z]/', $p) || !preg_match('/\d/', $p)) return 'Use both letters and numbers.';
  if ($user && stripos($p, $user) !== false) return 'Password must not contain the username.';
  return null;
}

/* Brute-force protection: per IP+username */
function lock_key(string $u): string { return hash('sha256', strtolower($u) . '|' . ($_SERVER['REMOTE_ADDR'] ?? '')); }
function is_locked(string $u): int {
  $l = jload('locks.json', []); $k = lock_key($u);
  if (!isset($l[$k])) return 0;
  $left = $l[$k]['until'] - time(); return $left > 0 ? (int)ceil($left / 60) : 0;
}
function note_failure(string $u): void {
  $l = jload('locks.json', []); $k = lock_key($u); $c = cfg();
  foreach ($l as $kk => $v) if (($v['last'] ?? 0) < time() - 86400) unset($l[$kk]);           // forget entries older than a day
  $e = $l[$k] ?? ['n' => 0, 'until' => 0, 'last' => 0];
  if ($e['until'] && $e['until'] < time()) $e = ['n' => 0, 'until' => 0, 'last' => 0];         // previous lock has expired
  $e['n']++; $e['last'] = time(); if ($e['n'] >= $c['max_attempts']) $e['until'] = time() + 60 * $c['lock_minutes'];
  $l[$k] = $e; jsave('locks.json', $l);
}
function clear_failures(string $u): void { $l = jload('locks.json', []); unset($l[lock_key($u)]); jsave('locks.json', $l); }

/* TOTP (RFC 6238) – works with Google Authenticator, Microsoft Authenticator, etc. */
function b32_random(int $len = 32): string { $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $s = ''; for ($i = 0; $i < $len; $i++) $s .= $a[random_int(0, 31)]; return $s; }
function b32_decode(string $s): string {
  $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
  foreach (str_split(strtoupper(preg_replace('/[^A-Z2-7]/i', '', $s))) as $ch) $bits .= str_pad(decbin(strpos($a, $ch)), 5, '0', STR_PAD_LEFT);
  foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $out .= chr(bindec($b));
  return $out;
}
function totp_at(string $secret, int $step): string {
  $h = hash_hmac('sha1', pack('N*', 0) . pack('N*', $step), b32_decode($secret), true);
  $o = ord($h[19]) & 0xf;
  $n = ((ord($h[$o]) & 0x7f) << 24 | ord($h[$o + 1]) << 16 | ord($h[$o + 2]) << 8 | ord($h[$o + 3])) % 1000000;
  return str_pad((string)$n, 6, '0', STR_PAD_LEFT);
}
function totp_ok(string $secret, string $code): bool {
  $code = preg_replace('/\D/', '', $code); if (strlen($code) !== 6) return false;
  $t = intdiv(time(), 30); foreach ([-1, 0, 1] as $d) if (hash_equals(totp_at($secret, $t + $d), $code)) return true;
  return false;
}

/* Session & CSRF */
function start_session(): void {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
  session_name('MPADADMIN');
  session_set_cookie_params(['lifetime' => 0, 'path' => dirname($_SERVER['SCRIPT_NAME']) . '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
  session_start();
  $idle = cfg()['session_minutes'] * 60;
  if (!empty($_SESSION['u']) && (time() - ($_SESSION['seen'] ?? 0)) > $idle) { $_SESSION = []; session_regenerate_id(true); $_SESSION['flash'] = ['ok', 'You were logged out after ' . cfg()['session_minutes'] . ' minutes of inactivity.']; }
  $_SESSION['seen'] = time();
  $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h($_SESSION['csrf']) . '">'; }
function csrf_ok(): bool { return is_string($_POST['csrf'] ?? null) && hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf']); }
function current_user(): ?array { return empty($_SESSION['u']) ? null : find_user($_SESSION['u']); }
function flash(string $type, string $msg): void { $_SESSION['flash'] = [$type, $msg]; }
function go(string $q = ''): void { header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . ($q ? '?' . $q : '')); exit; }
function fmt_size(int $b): string { return $b >= 1048576 ? round($b / 1048576, 1) . ' MB' : max(1, round($b / 1024)) . ' KB'; }

<?php
/* MPAD QC LAB — private admin area: company details & documents */
declare(strict_types=1);
require __DIR__ . '/lib.php';
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

try { vault_init(); } catch (Throwable $e) { http_response_code(500); exit('Admin storage is not available: ' . h($e->getMessage())); }
start_session();
$c = cfg();
$me = current_user();
if ($me === null && !empty($_SESSION['u'])) { $_SESSION = []; }           // account was removed
$a = $_GET['a'] ?? '';
$err = null;

/* ------------------------------------------------------------------ POST actions */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!csrf_ok()) { http_response_code(400); exit('Your session expired. Please go back, refresh the page and try again.'); }
  $act = $_POST['action'] ?? '';

  // First-time setup
  if ($act === 'setup') {
    if (users()) go();
    $code = (string)($_POST['code'] ?? ''); $u = trim((string)($_POST['username'] ?? '')); $p = (string)($_POST['password'] ?? '');
    if ($c['setup_code'] === '' || !hash_equals((string)$c['setup_code'], $code)) { audit($u ?: '?', 'Setup attempt with wrong setup code'); $err = 'Setup code is incorrect.'; }
    elseif (!valid_username($u)) $err = 'Username: 3–30 letters, numbers, dot, dash or underscore.';
    elseif ($p !== ($_POST['password2'] ?? '')) $err = 'Passwords do not match.';
    elseif ($m = password_problem($p, $u)) $err = $m;
    else {
      save_users([['u' => $u, 'hash' => password_hash($p, PASSWORD_DEFAULT), 'must_change' => false, 'totp' => '', 'created' => now(), 'last_login' => '']]);
      audit($u, 'First admin account created');
      session_regenerate_id(true); $_SESSION['u'] = $u; flash('ok', 'Admin account created. Welcome!'); go();
    }
  }

  // Login
  elseif ($act === 'login') {
    $u = trim((string)($_POST['username'] ?? '')); $p = (string)($_POST['password'] ?? ''); $code = (string)($_POST['code'] ?? '');
    if ($mins = is_locked($u)) { $err = "Too many wrong attempts. Try again in $mins minute(s)."; audit($u, 'Login blocked (locked)'); }
    else {
      $user = find_user($u);
      $okPw = $user && password_verify($p, $user['hash']);
      if (!$user) password_verify($p, '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG'); // equal timing
      if ($okPw && $user['totp'] !== '' && !totp_ok($user['totp'], $code)) { $okPw = false; $err = 'Enter the 6-digit code from your authenticator app.'; }
      if (!$okPw) { note_failure($u); audit($u ?: '?', 'Failed login'); $err ??= 'Wrong username or password.';
        if ($mins = is_locked($u)) $err = "Too many wrong attempts. Try again in $mins minute(s)."; }
      else {
        clear_failures($u); session_regenerate_id(true); $_SESSION['u'] = $user['u'];
        update_user($user['u'], function ($x) { $x['last_login'] = now(); return $x; });
        audit($user['u'], 'Logged in'); go();
      }
    }
  }

  // Everything below needs a logged-in user
  elseif (!$me) { go(); }

  elseif ($act === 'logout') { audit($me['u'], 'Logged out'); $_SESSION = []; session_regenerate_id(true); flash('ok', 'You have been logged out.'); go(); }

  elseif ($act === 'change_password') {
    $cur = (string)($_POST['current'] ?? ''); $p = (string)($_POST['password'] ?? '');
    if (!password_verify($cur, $me['hash'])) $err = 'Current password is wrong.';
    elseif ($p !== ($_POST['password2'] ?? '')) $err = 'New passwords do not match.';
    elseif ($p === $cur) $err = 'Choose a password different from the current one.';
    elseif ($m = password_problem($p, $me['u'])) $err = $m;
    else { update_user($me['u'], function ($x) use ($p) { $x['hash'] = password_hash($p, PASSWORD_DEFAULT); $x['must_change'] = false; return $x; });
           session_regenerate_id(true); audit($me['u'], 'Changed own password'); flash('ok', 'Password changed.'); go(); }
  }

  elseif (!empty($me['must_change'])) { go(); }   // must change password before anything else

  elseif ($act === 'save_details') {
    $labels = (array)($_POST['label'] ?? []); $values = (array)($_POST['value'] ?? []); $fields = [];
    foreach ($labels as $i => $l) { $l = trim(mb_substr((string)$l, 0, 80)); $v = trim(mb_substr((string)($values[$i] ?? ''), 0, 500)); if ($l !== '') $fields[] = ['label' => $l, 'value' => $v]; }
    jsave('details.json', ['fields' => $fields]); audit($me['u'], 'Updated company details'); flash('ok', 'Company details saved.'); go('#details');
  }

  elseif ($act === 'upload') {
    $f = $_FILES['file'] ?? null; $title = trim(mb_substr((string)($_POST['title'] ?? ''), 0, 120)); $cat = (string)($_POST['category'] ?? '');
    if (!in_array($cat, $c['categories'], true)) $cat = 'Other';
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) $err = 'Please choose a file to upload' . (($f['error'] ?? 0) === UPLOAD_ERR_INI_SIZE ? ' (file is larger than the server allows).' : '.');
    elseif ($f['size'] > $c['max_upload_mb'] * 1048576) $err = 'File is larger than ' . $c['max_upload_mb'] . ' MB.';
    else {
      $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
      if (!isset($c['allowed_types'][$mime])) $err = 'Only PDF, JPG, PNG or WebP files are allowed.';
      else {
        $id = bin2hex(random_bytes(12)); $ext = $c['allowed_types'][$mime];
        if (!move_uploaded_file($f['tmp_name'], vault('files/' . $id . '.' . $ext))) $err = 'Could not save the file on the server.';
        else {
          chmod(vault('files/' . $id . '.' . $ext), 0600);
          $orig = preg_replace('/[^\w.\- ()]+/u', '_', basename((string)$f['name'])) ?: ('document.' . $ext);
          $docs = jload('docs.json', []);
          $docs[] = ['id' => $id, 'title' => $title ?: pathinfo($orig, PATHINFO_FILENAME), 'category' => $cat, 'file' => $id . '.' . $ext, 'original' => $orig,
                     'mime' => $mime, 'size' => (int)$f['size'], 'by' => $me['u'], 'at' => now()];
          jsave('docs.json', $docs); audit($me['u'], 'Uploaded "' . ($title ?: $orig) . '"'); flash('ok', 'Document uploaded.'); go('#documents');
        }
      }
    }
  }

  elseif ($act === 'delete_doc') {
    $id = (string)($_POST['id'] ?? ''); $docs = jload('docs.json', []); $kept = []; $gone = null;
    foreach ($docs as $d) { if (hash_equals($d['id'], $id)) $gone = $d; else $kept[] = $d; }
    if ($gone) { @unlink(vault('files/' . basename($gone['file']))); jsave('docs.json', $kept); audit($me['u'], 'Deleted "' . $gone['title'] . '"'); flash('ok', 'Document deleted.'); }
    go('#documents');
  }

  elseif ($act === 'add_user') {
    $u = trim((string)($_POST['username'] ?? '')); $p = (string)($_POST['password'] ?? '');
    if (!valid_username($u)) $err = 'Username: 3–30 letters, numbers, dot, dash or underscore.';
    elseif (find_user($u)) $err = 'That username already exists.';
    elseif ($m = password_problem($p, $u)) $err = $m;
    else { $all = users(); $all[] = ['u' => $u, 'hash' => password_hash($p, PASSWORD_DEFAULT), 'must_change' => true, 'totp' => '', 'created' => now(), 'last_login' => ''];
           save_users($all); audit($me['u'], "Added admin \"$u\""); flash('ok', "Admin \"$u\" added. They must change the temporary password at first login."); go('#users'); }
  }

  elseif ($act === 'reset_user') {
    $u = (string)($_POST['username'] ?? ''); $p = (string)($_POST['password'] ?? '');
    if (!find_user($u)) $err = 'User not found.';
    elseif ($m = password_problem($p, $u)) $err = $m;
    else { update_user($u, function ($x) use ($p) { $x['hash'] = password_hash($p, PASSWORD_DEFAULT); $x['must_change'] = true; $x['totp'] = ''; return $x; });
           clear_failures($u); audit($me['u'], "Reset password of \"$u\""); flash('ok', "Temporary password set for \"$u\" (2-step code also reset)."); go('#users'); }
  }

  elseif ($act === 'delete_user') {
    $u = (string)($_POST['username'] ?? '');
    if (strcasecmp($u, $me['u']) === 0) $err = 'You cannot remove your own account.';
    elseif (count(users()) <= 1) $err = 'At least one admin must remain.';
    else { save_users(array_filter(users(), fn($x) => strcasecmp($x['u'], $u) !== 0)); audit($me['u'], "Removed admin \"$u\""); flash('ok', "Admin \"$u\" removed."); go('#users'); }
  }

  elseif ($act === 'totp_begin') { $_SESSION['totp_new'] = b32_random(); go('a=security'); }
  elseif ($act === 'totp_confirm') {
    $s = $_SESSION['totp_new'] ?? '';
    if ($s && totp_ok($s, (string)($_POST['code'] ?? ''))) { update_user($me['u'], function ($x) use ($s) { $x['totp'] = $s; return $x; }); unset($_SESSION['totp_new']);
      audit($me['u'], 'Turned on 2-step verification'); flash('ok', '2-step verification is on. You will need your authenticator code at every login.'); go('a=security'); }
    $err = 'That code did not match. Check the time on your phone and try again.'; $a = 'security';
  }
  elseif ($act === 'totp_disable') {
    if (!password_verify((string)($_POST['current'] ?? ''), $me['hash'])) { $err = 'Current password is wrong.'; $a = 'security'; }
    else { update_user($me['u'], function ($x) { $x['totp'] = ''; return $x; }); audit($me['u'], 'Turned off 2-step verification'); flash('ok', '2-step verification turned off.'); go('a=security'); }
  }
  $me = current_user();
}

/* ------------------------------------------------------------------ Download (GET, logged in only) */
if ($a === 'download' && $me && empty($me['must_change'])) {
  $id = (string)($_GET['id'] ?? '');
  foreach (jload('docs.json', []) as $d) if (hash_equals($d['id'], $id)) {
    $path = vault('files/' . basename($d['file']));
    if (!is_file($path)) break;
    audit($me['u'], 'Downloaded "' . $d['title'] . '"');
    $name = preg_replace('/[^\w.\- ()]+/u', '_', $d['title']) . '.' . pathinfo($d['file'], PATHINFO_EXTENSION);
    header('Content-Type: ' . $d['mime']); header('Content-Length: ' . filesize($path));
    header('Content-Disposition: ' . (isset($_GET['view']) ? 'inline' : 'attachment') . '; filename="' . $name . '"');
    header('X-Content-Type-Options: nosniff'); readfile($path); exit;
  }
  http_response_code(404); exit('Document not found.');
}

/* ------------------------------------------------------------------ Views */
$flash = $_SESSION['flash'] ?? null; unset($_SESSION['flash']);
function layout(string $title, string $body, ?array $me, ?string $err, ?array $flash): void { ?>
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title><?= h($title) ?> · MPAD Admin</title><link rel="icon" href="../img/favicon.png"><link rel="stylesheet" href="../css/site.css">
<style>
body{background:var(--paper)} .abar{background:var(--ink);color:#fff} .abar .wrap{display:flex;align-items:center;gap:14px;min-height:62px;flex-wrap:wrap}
.abar b{color:var(--amber);letter-spacing:.06em} .abar nav{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap} .abar nav a,.abar nav button{color:#dbe3f0;text-decoration:none;padding:.5em .8em;border-radius:8px;font:inherit;font-size:.92rem;background:none;border:0;cursor:pointer}
.abar nav a:hover,.abar nav button:hover{background:#1f3a6e;color:#fff} .amain{padding:28px 0 60px} .panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:clamp(16px,3vw,26px);margin-bottom:22px}
.panel h2{font-size:1.35rem;margin-bottom:14px} .msg{padding:12px 16px;border-radius:10px;margin-bottom:18px;font-size:.95rem} .msg.ok{background:#e9f7ef;border:1px solid #b6e2c6;color:#145c31} .msg.err{background:#fdecea;border:1px solid #f3b8b0;color:#7a1f15}
.kv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr) auto;gap:8px;align-items:center} .kv input{width:100%;font:inherit;padding:.6em .7em;border:1.5px solid var(--line);border-radius:8px;background:var(--paper)}
.kv .copy{padding:.55em .8em} table.t{width:100%;border-collapse:collapse;font-size:.94rem} table.t th,table.t td{padding:10px 8px;border-bottom:1px solid var(--paper-2);text-align:left;vertical-align:middle}
table.t th{font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)} .acts{display:flex;gap:6px;flex-wrap:wrap} .acts form{margin:0}
.btn-xs{padding:.5em .8em;font-size:.86rem} .btn-red{background:#fff;color:var(--red);border-color:#f0c5c0} .btn-red:hover{background:var(--red);color:#fff}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:22px} .muted{color:var(--muted);font-size:.88rem}
.login{max-width:420px;margin:7vh auto} .code{font-family:ui-monospace,Consolas,monospace;font-size:1.15rem;letter-spacing:.12em;background:var(--paper);padding:10px 12px;border-radius:8px;word-break:break-all}
@media (max-width:700px){.kv{grid-template-columns:1fr auto}.kv .lab{grid-column:1/-1;font-size:.82rem}.t .hide-m{display:none}}
</style></head><body>
<div class="abar"><div class="wrap"><b>MPAD QC LAB</b><span>Admin area</span>
<?php if ($me && empty($me['must_change'])): ?><nav><a href="./">Dashboard</a><a href="./#documents">Documents</a><a href="./#users">Admins</a><a href="./?a=activity">Activity</a><a href="./?a=security">My account</a>
<form method="post" style="margin:0"><?= csrf_field() ?><input type="hidden" name="action" value="logout"><button type="submit">Log out (<?= h($me['u']) ?>)</button></form></nav><?php endif; ?>
</div></div>
<main class="amain"><div class="wrap">
<?php if ($flash): ?><div class="msg <?= $flash[0] === 'ok' ? 'ok' : 'err' ?>" role="status"><?= h($flash[1]) ?></div><?php endif; ?>
<?php if ($err): ?><div class="msg err" role="alert"><?= h($err) ?></div><?php endif; ?>
<?= $body ?>
</div></main>
<script>
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var i=document.getElementById(b.getAttribute('data-copy'));navigator.clipboard.writeText(i.value).then(function(){var t=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=t},1200)})})});
document.querySelectorAll('form[data-confirm]').forEach(function(f){f.addEventListener('submit',function(e){if(!confirm(f.getAttribute('data-confirm')))e.preventDefault()})});
var add=document.getElementById('add-field');add&&add.addEventListener('click',function(){var k=document.getElementById('kv'),n=k.querySelectorAll('.lab').length;k.insertAdjacentHTML('beforeend','<input class="lab" name="label[]" placeholder="Label (e.g. Shop licence no.)"><input id="v'+n+'" name="value[]" placeholder="Value"><span></span>')});
</script>
</body></html>
<?php }

$u = function (string $k) { return h((string)($_POST[$k] ?? '')); };   // re-fill form fields after an error

/* Setup screen */
if (!users()) {
  $body = '<div class="login panel"><h2>Set up the admin area</h2>'
    . ($c['setup_code'] === '' ? '<p>To create the first admin, open <b>public_html/admin/config.php</b> in cPanel File Manager, type a secret word in <code>setup_code</code>, save, and reload this page.</p></div>'
    : '<p class="muted">Create the first admin account. Enter the setup code you typed in <code>admin/config.php</code>.</p>
      <form class="form" method="post" autocomplete="off">' . csrf_field() . '<input type="hidden" name="action" value="setup">
      <div class="field"><label for="code">Setup code</label><input id="code" name="code" type="password" required></div>
      <div class="field"><label for="un">Admin username</label><input id="un" name="username" required value="' . $u('username') . '" autocomplete="username"></div>
      <div class="field"><label for="pw">Password <span class="opt">(10+ characters, letters and numbers)</span></label><input id="pw" name="password" type="password" required autocomplete="new-password"></div>
      <div class="field"><label for="pw2">Repeat password</label><input id="pw2" name="password2" type="password" required autocomplete="new-password"></div>
      <button class="btn btn-primary" type="submit">Create admin</button></form></div>');
  layout('Setup', $body, null, $err, $flash); exit;
}

/* Login screen */
if (!$me) {
  $body = '<div class="login panel"><h2>Admin login</h2><form class="form" method="post">' . csrf_field() . '<input type="hidden" name="action" value="login">
    <div class="field"><label for="un">Username</label><input id="un" name="username" required autocomplete="username" value="' . $u('username') . '"></div>
    <div class="field"><label for="pw">Password</label><input id="pw" name="password" type="password" required autocomplete="current-password"></div>
    <div class="field"><label for="cd">Authenticator code <span class="opt">(only if 2-step verification is on)</span></label><input id="cd" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <button class="btn btn-primary" type="submit">Log in</button></form><p class="muted" style="margin-top:14px">Forgot your password? Ask another admin to set a temporary one.</p></div>';
  layout('Login', $body, null, $err, $flash); exit;
}

$pwForm = function (string $title, string $note) { return '<div class="panel" style="max-width:520px"><h2>' . $title . '</h2><p class="muted">' . $note . '</p><form class="form" method="post">' . csrf_field() . '<input type="hidden" name="action" value="change_password">
  <div class="field"><label for="cur">Current password</label><input id="cur" name="current" type="password" required autocomplete="current-password"></div>
  <div class="field"><label for="np">New password <span class="opt">(10+ characters, letters and numbers)</span></label><input id="np" name="password" type="password" required autocomplete="new-password"></div>
  <div class="field"><label for="np2">Repeat new password</label><input id="np2" name="password2" type="password" required autocomplete="new-password"></div>
  <button class="btn btn-primary" type="submit">Change password</button></form></div>'; };

/* Forced password change */
if (!empty($me['must_change'])) { layout('Change password', $pwForm('Set your own password', 'You logged in with a temporary password. Choose your own password to continue.'), $me, $err, $flash); exit; }

/* Activity */
if ($a === 'activity') {
  $rows = ''; foreach (audit_tail(200) as $e) $rows .= '<tr><td>' . h($e['t'] ?? '') . '</td><td>' . h($e['u'] ?? '') . '</td><td>' . h($e['e'] ?? '') . '</td><td class="hide-m muted">' . h($e['ip'] ?? '') . '</td></tr>';
  layout('Activity', '<div class="panel"><h2>Activity log</h2><p class="muted">Last 200 events: logins, failed logins, uploads, downloads and changes.</p><div style="overflow-x:auto"><table class="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th class="hide-m">IP address</th></tr></thead><tbody>' . ($rows ?: '<tr><td colspan="4">No activity yet.</td></tr>') . '</tbody></table></div></div>', $me, $err, $flash); exit;
}

/* My account / 2-step */
if ($a === 'security') {
  $new = $_SESSION['totp_new'] ?? '';
  if ($me['totp'] !== '') $t = '<p>2-step verification is <b style="color:var(--green)">ON</b>. You need the 6-digit code from your authenticator app at every login.</p>
    <form class="form" method="post" style="max-width:420px">' . csrf_field() . '<input type="hidden" name="action" value="totp_disable"><div class="field"><label for="dc">Current password (to turn it off)</label><input id="dc" name="current" type="password" required></div><button class="btn btn-ghost btn-sm" type="submit">Turn off 2-step verification</button></form>';
  elseif ($new) $t = '<ol><li>Open <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone → <b>+</b> → <b>Enter a setup key</b>.</li><li>Account name: <b>MPAD Admin – ' . h($me['u']) . '</b>, Key:<div class="code" style="margin:8px 0">' . h(trim(chunk_split($new, 4, ' '))) . '</div>Type: <b>Time based</b>.</li><li>Enter the 6-digit code the app shows:</li></ol>
    <form class="form" method="post" style="max-width:320px">' . csrf_field() . '<input type="hidden" name="action" value="totp_confirm"><div class="field"><label for="tc">6-digit code</label><input id="tc" name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div><button class="btn btn-primary" type="submit">Turn on</button></form>';
  else $t = '<p>Add a second lock to your account: after your password, you also enter a 6-digit code from an app on your phone. Strongly recommended for this area.</p><form method="post">' . csrf_field() . '<input type="hidden" name="action" value="totp_begin"><button class="btn btn-dark" type="submit">Set up 2-step verification</button></form>';
  layout('My account', '<div class="grid2"><div class="panel"><h2>2-step verification</h2>' . $t . '</div>' . $pwForm('Change password', 'Use at least 10 characters with letters and numbers.') . '</div>', $me, $err, $flash); exit;
}

/* Dashboard */
$det = jload('details.json', ['fields' => []])['fields']; $kv = '';
foreach ($det as $i => $f) $kv .= '<input class="lab" name="label[]" value="' . h($f['label']) . '" aria-label="Label"><input id="v' . $i . '" name="value[]" value="' . h($f['value']) . '" aria-label="' . h($f['label']) . '"><button type="button" class="btn btn-ghost btn-xs copy" data-copy="v' . $i . '">Copy</button>';
$docs = jload('docs.json', []); usort($docs, fn($x, $y) => strcmp($x['category'] . $x['title'], $y['category'] . $y['title']));
$dr = ''; foreach ($docs as $d) $dr .= '<tr><td><b>' . h($d['title']) . '</b><div class="muted">' . h($d['original']) . '</div></td><td class="hide-m">' . h($d['category']) . '</td><td class="hide-m">' . fmt_size($d['size']) . '</td><td class="hide-m muted">' . h($d['at']) . '<br>by ' . h($d['by']) . '</td><td><div class="acts">'
  . '<a class="btn btn-dark btn-xs" href="?a=download&amp;id=' . h($d['id']) . '">Download</a><a class="btn btn-ghost btn-xs" target="_blank" rel="noopener" href="?a=download&amp;view=1&amp;id=' . h($d['id']) . '">View</a>'
  . '<form method="post" data-confirm="Delete &quot;' . h($d['title']) . '&quot; permanently?">' . csrf_field() . '<input type="hidden" name="action" value="delete_doc"><input type="hidden" name="id" value="' . h($d['id']) . '"><button class="btn btn-red btn-xs" type="submit">Delete</button></form></div></td></tr>';
$cats = ''; foreach ($c['categories'] as $ct) $cats .= '<option>' . h($ct) . '</option>';
$ur = ''; foreach (users() as $x) $ur .= '<tr><td><b>' . h($x['u']) . '</b>' . (strcasecmp($x['u'], $me['u']) === 0 ? ' <span class="tag">you</span>' : '') . ($x['must_change'] ? ' <span class="tag amber">temporary password</span>' : '') . '</td><td class="hide-m">' . ($x['totp'] ? '✔ 2-step on' : '—') . '</td><td class="hide-m muted">' . h($x['last_login'] ?: 'never') . '</td><td>'
  . (strcasecmp($x['u'], $me['u']) === 0 ? '<a class="btn btn-ghost btn-xs" href="?a=security">My account</a>' : '<div class="acts"><form method="post" class="acts">' . csrf_field() . '<input type="hidden" name="action" value="reset_user"><input type="hidden" name="username" value="' . h($x['u']) . '"><input name="password" type="password" placeholder="New temporary password" required style="font:inherit;padding:.45em .6em;border:1.5px solid var(--line);border-radius:8px;max-width:190px" autocomplete="new-password"><button class="btn btn-ghost btn-xs" type="submit">Reset</button></form>'
  . '<form method="post" data-confirm="Remove admin &quot;' . h($x['u']) . '&quot;?">' . csrf_field() . '<input type="hidden" name="action" value="delete_user"><input type="hidden" name="username" value="' . h($x['u']) . '"><button class="btn btn-red btn-xs" type="submit">Remove</button></form></div>') . '</td></tr>';

$tip = $me['totp'] === '' ? '<div class="msg ok" style="background:#fff8e6;border-color:#f3d48a;color:#5c4300">Tip: turn on <a href="?a=security">2-step verification</a> for extra protection of these documents.</div>' : '';
$body = $tip . '
<div class="panel" id="details"><h2>Company details</h2><p class="muted">Click <b>Copy</b> to copy a value. Edit any value or label and press Save. Leave a label empty to remove that row.</p>
<form method="post">' . csrf_field() . '<input type="hidden" name="action" value="save_details"><div class="kv" id="kv">' . $kv . '</div>
<div class="form-actions" style="margin-top:14px"><button class="btn btn-primary btn-sm" type="submit">Save details</button><button class="btn btn-ghost btn-sm" type="button" id="add-field">+ Add a row</button></div></form></div>

<div class="panel" id="documents"><h2>Documents</h2>
<div style="overflow-x:auto"><table class="t"><thead><tr><th>Document</th><th class="hide-m">Category</th><th class="hide-m">Size</th><th class="hide-m">Uploaded</th><th>Actions</th></tr></thead><tbody>' . ($dr ?: '<tr><td colspan="5" class="muted">No documents yet. Upload GST certificate, PAN card, incorporation certificate, NABL certificate and more below.</td></tr>') . '</tbody></table></div>
<h3 style="margin-top:22px">Upload a document</h3>
<form class="form" method="post" enctype="multipart/form-data">' . csrf_field() . '<input type="hidden" name="action" value="upload">
<div class="row"><div class="field"><label for="ti">Title</label><input id="ti" name="title" maxlength="120" placeholder="e.g. GST registration certificate" required></div>
<div class="field"><label for="ca">Category</label><select id="ca" name="category">' . $cats . '</select></div></div>
<div class="field"><label for="fi">File <span class="opt">(PDF, JPG, PNG or WebP · max ' . $c['max_upload_mb'] . ' MB)</span></label><input id="fi" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required></div>
<div><button class="btn btn-primary btn-sm" type="submit">Upload</button></div></form></div>

<div class="panel" id="users"><h2>Admins</h2><div style="overflow-x:auto"><table class="t"><thead><tr><th>Username</th><th class="hide-m">2-step</th><th class="hide-m">Last login</th><th>Actions</th></tr></thead><tbody>' . $ur . '</tbody></table></div>
<h3 style="margin-top:22px">Add an admin</h3><p class="muted">Give them a temporary password; they will be asked to choose their own at first login.</p>
<form class="form" method="post" autocomplete="off">' . csrf_field() . '<input type="hidden" name="action" value="add_user"><div class="row">
<div class="field"><label for="nu">Username</label><input id="nu" name="username" required placeholder="e.g. ravi" autocomplete="off"></div>
<div class="field"><label for="npw">Temporary password</label><input id="npw" name="password" type="password" required autocomplete="new-password"></div></div>
<div><button class="btn btn-dark btn-sm" type="submit">Add admin</button></div></form></div>';
layout('Dashboard', $body, $me, $err, $flash);

<?php
/* Fetches the latest Google reviews and saves the best ones to /data/reviews.json.
   Run automatically by a cPanel Cron Job (see README), or open in a browser with ?token=YOUR_CRON_TOKEN */
declare(strict_types=1);
$cfg = require __DIR__ . '/config.php';
$cli = PHP_SAPI === 'cli';
if (!$cli) {
  header('Content-Type: text/plain; charset=utf-8');
  if (!hash_equals((string)$cfg['cron_token'], (string)($_GET['token'] ?? '')) || $cfg['cron_token'] === 'change-me-to-a-long-random-word') { http_response_code(403); exit("Forbidden\n"); }
}
if ($cfg['google_api_key'] === '' || $cfg['google_place_id'] === '') exit("Set google_api_key and google_place_id in api/config.php first.\n");

$url = ($cfg['places_api_base'] ?? 'https://places.googleapis.com/v1/places/') . rawurlencode($cfg['google_place_id']) . '?languageCode=en';
$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
  CURLOPT_HTTPHEADER => ['X-Goog-Api-Key: ' . $cfg['google_api_key'], 'X-Goog-FieldMask: rating,userRatingCount,googleMapsUri,reviews'],
]);
$res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
$j = json_decode((string)$res, true);
if ($code !== 200 || !is_array($j)) exit("Google API error ($code): " . substr((string)$res, 0, 400) . "\nreviews.json was NOT changed.\n");

$list = [];
foreach ($j['reviews'] ?? [] as $r) {
  $text = trim($r['originalText']['text'] ?? ($r['text']['text'] ?? ''));
  $stars = (int)($r['rating'] ?? 0);
  if ($stars < $cfg['reviews_min_stars'] || mb_strlen($text) < $cfg['reviews_min_chars']) continue;
  $list[] = [
    'author' => $r['authorAttribution']['displayName'] ?? 'Google user',
    'author_uri' => $r['authorAttribution']['uri'] ?? '',
    'photo' => $r['authorAttribution']['photoUri'] ?? '',
    'rating' => $stars, 'text' => mb_strimwidth($text, 0, 420, '…'),
    'relative' => $r['relativePublishTimeDescription'] ?? '', 'time' => $r['publishTime'] ?? '',
  ];
}
usort($list, fn($a, $b) => [$b['rating'], $b['time']] <=> [$a['rating'], $a['time']]);
$out = [
  'updated' => gmdate('c'), 'rating' => $j['rating'] ?? null, 'count' => $j['userRatingCount'] ?? null,
  'maps_uri' => $j['googleMapsUri'] ?? '', 'reviews' => array_slice($list, 0, (int)$cfg['reviews_max']),
];
$path = dirname(__DIR__) . '/data/reviews.json';
file_put_contents($path . '.tmp', json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
rename($path . '.tmp', $path);
echo 'OK — saved ' . count($out['reviews']) . " review(s). Overall rating: " . ($out['rating'] ?? 'n/a') . "\n";

# MPAD QC Lab website: setup & maintenance guide

The new website is a set of plain files (HTML, CSS, JavaScript and two small PHP scripts). It needs no database, no WordPress and no build step on the server. Everything below is done in **cPanel → File Manager**.

---

## 1. What's in the zip

| Folder / file | What it is | Do you edit it? |
|---|---|---|
| `index.html`, `services/`, `about/`, `contact/` … | The pages | No (ask your developer for text changes) |
| `data/nabl.json` | NABL certificate number and dates | **Yes**, when renewed |
| `data/clients.json` | Client list (Home + Projects page) | **Yes**, to add clients |
| `data/projects.json` | Project cards (Home + Projects page) | **Yes**, to add projects |
| `data/equipment.json` | Equipment page cards | **Yes**, to add equipment |
| `data/gallery.json` | Gallery photos | **Yes**, to add photos |
| `data/more-services.json` | Extra services (Services page + form lists) | **Yes**, to add services |
| `data/reviews.json` | Google reviews (filled automatically) | No |
| `docs/` | Put the NABL certificate & scope PDFs here | **Yes** |
| `img/projects/`, `img/clients/`, `img/equipment/`, `img/gallery/` | Put new photos / logos here | **Yes** |
| `api/config.php` | Email + Google Reviews settings | Once, during setup |
| `api/enquiry.php` | Sends enquiry emails | No |
| `api/refresh-reviews.php` | Fetches Google reviews | No |
| `api/storage/enquiries.csv` | Backup copy of every enquiry (created automatically) | Download to read |
| `.htaccess` | Speed, security, HTTPS, redirects | Only the go-live line (step 3) |

> **Hidden files:** in File Manager, click **Settings → Show Hidden Files (dotfiles)**, or you won't see `.htaccess`.

---

## 2. Test first, in a preview folder

1. File Manager → open `public_html` → **+ Folder** → name it `preview`.
2. Open `preview` → **Upload** → choose `mpadqclab-website.zip`.
3. Right-click the zip → **Extract** → into `/public_html/preview`. Delete the zip afterwards.
4. Open **https://mpadqclab.com/preview/** in your browser.

✅ **Checkpoint A:** the home page loads with photos. The Services menu opens, and every page in the top menu opens.

5. Go to **Contact**, fill the form with your own details and press **Send enquiry**.

✅ **Checkpoint B:** you see a green tick with a reference number (e.g. `MPAD-261101-3F2A`). Within a minute `mpadqclab@gmail.com` receives an email whose subject starts with **`[MPAD Website]`**, and the email address you entered receives a "We received your enquiry" email.
   - **Not in the inbox?** Check Gmail Spam, then do step 4 (email deliverability).
   - **Error message instead of the tick?** See *Troubleshooting* at the bottom.

---

## 3. Go live

1. **Back up the current site:** File Manager → select everything in `public_html` *except* `preview`, `cgi-bin` and `.well-known` → **Compress** → download the zip to your computer.
2. Move those old files into a new folder `public_html/old-site` (select → **Move**).
3. Upload `mpadqclab-website.zip` into `public_html` and **Extract** there.
4. Edit `public_html/.htaccess` and remove the `#` at the start of this line:
   `# RedirectMatch 301 ^/newsite(/.*)?$ /` → `RedirectMatch 301 ^/newsite(/.*)?$ /`
   (This sends anyone using the old /newsite address, including Google, to the new site.)
5. Delete the `preview` folder.

✅ **Checkpoint C:** https://mpadqclab.com opens the new site. http://mpadqclab.com and https://www.mpadqclab.com both switch to https://mpadqclab.com. https://mpadqclab.com/newsite/ lands on the new home page. A made-up address such as https://mpadqclab.com/abc shows the branded "page not found" page.

> If your SSL certificate is not active yet (cPanel → SSL/TLS Status), remove the four "Force HTTPS" lines from `.htaccess` until it is.

---

## 4. Email deliverability (one time, 10 minutes)

Enquiry emails are sent *from* `no-reply@mpadqclab.com` *to* `mpadqclab@gmail.com`. Gmail trusts them only if your domain is set up correctly:

1. cPanel → **Email Accounts** → **Create** → `no-reply@mpadqclab.com` (any strong password; you never need to log in).
2. cPanel → **Email Deliverability** → if `mpadqclab.com` shows a problem, click **Repair** (this sets up SPF and DKIM).
3. In Gmail, create a filter: **Settings → Filters → Create filter → Subject: `[MPAD Website]`** → *Never send to Spam*, *Star it*, *Apply label "Website enquiry"*.

**Replying:** press *Reply* in Gmail to answer the customer directly (Reply-To is set to their address). Each enquiry email also has **Call** and **Reply on WhatsApp** buttons.

**WhatsApp:** every page has WhatsApp buttons to +91 90002 19015 with a pre-filled message, and the form offers "WhatsApp instead" plus "Send on WhatsApp" after submitting. Sending an automatic WhatsApp message to *your* phone for every enquiry is not possible without the paid WhatsApp Business API. The Gmail app on your phone gives you an instant notification instead.

---

## 5. NABL certificate & dates

- **Upload the certificate:** save it as a PDF named exactly `nabl-certificate.pdf` and the scope as `nabl-scope.pdf`, then upload both into the `docs` folder. The **Download certificate** and **Scope of accreditation** buttons appear automatically. Until then they stay hidden and the NABL page says "available on request".
- **Using an image instead of a PDF?** Upload e.g. `nabl-certificate.jpg` and change `"certificate_file"` in `data/nabl.json` to `"docs/nabl-certificate.jpg"`.
- **When renewed:** File Manager → `data/nabl.json` → right-click → **Edit** → change `issue_date` / `valid_until` → **Save**. Then upload the new PDF over the old one.

✅ **Checkpoint D:** https://mpadqclab.com/nabl-accreditation/ shows the buttons, and they open your PDFs.

---

## 6. Adding projects and clients

### Add a project
1. Upload a landscape photo (about 1200 px wide, JPG or WebP) to `img/projects/`, e.g. `img/projects/kokapet-towers.jpg`.
2. Edit `data/projects.json`. Copy the **TEMPLATE** block at the bottom and paste it just above it. Fill in:
   - `"published": true`: shows it on the Projects page
   - `"featured": true`: also shows it on the Home page (six projects look best)
   - `title`, `category`, `summary`, and optionally `client`, `location`, `year` (leave as `""` to hide)
   - `"image": "img/projects/kokapet-towers.jpg"`
3. Make sure there is a **comma** between blocks, then **Save**.

### Add a client
Edit `data/clients.json` and copy any line, for example:
`{ "name": "New Client Pvt Ltd", "sector": "Real estate", "featured": false },`
- `"featured": true` also shows the client on the Home page.
- Optional logo: upload it to `img/clients/` and add `"logo": "img/clients/new-client.png"`.
- `"show": false` hides a client without deleting it.


### Add equipment
Upload a photo (landscape 4:3, about 1200 px wide) to `img/equipment/`. In `data/equipment.json`, copy the TEMPLATE block, paste it above, fill in `name`, `description`, `tags`, set `"image": "img/equipment/your-photo.jpg"` and `"published": true`. No photo yet? Use `"image": ""` and a neat placeholder is shown.

### Add gallery photos
Upload to `img/gallery/`, then add a line at the top of the list in `data/gallery.json`:
`{ "image": "img/gallery/site-visit.jpg", "caption": "Plate load test at Shamshabad" },`

### Add a service
In `data/more-services.json`, copy the TEMPLATE block, fill in `name`, `description` and `tests`, and set `"published": true`. It appears on the Services page under "More testing services" and in every enquiry form's service list. A full dedicated page (with its own Google ranking, like the 8 main services) needs a developer: send the details and it takes a few minutes.

> **Tip:** before saving, paste the whole file into https://jsonlint.com to check for a missing comma or quote. If the file has an error, the site keeps showing the previous list, so nothing breaks.

---

## 7. Google Reviews (automatic)

The website shows your best Google reviews (4★ and above, with real text, up to 5) plus your overall rating. Until this is set up, the section shows "See us on Google / Write a Google review" buttons.

1. Go to https://console.cloud.google.com → create a project ("MPAD Website") → enable **billing**. A weekly refresh costs a negligible amount and is normally covered by Google's free monthly usage.
2. **APIs & Services → Library** → enable **Places API (New)**.
3. **APIs & Services → Credentials → Create credentials → API key.** Click the key → *API restrictions* → restrict to **Places API (New)**. Optionally, under *Application restrictions*, choose IP addresses and enter your hosting server's IP (shown in cPanel's sidebar as "Shared IP Address").
4. Find your **Place ID:** open https://developers.google.com/maps/documentation/places/web-service/place-id, search "MPAD QC LAB", and copy the ID (starts with `ChIJ…`).
5. Edit `api/config.php`: paste the key into `google_api_key`, the Place ID into `google_place_id`, and change `cron_token` to a long random word. Save.
6. Run it once: open `https://mpadqclab.com/api/refresh-reviews.php?token=YOUR_CRON_TOKEN`. It should say `OK — saved N review(s)`.
7. Automate it: cPanel → **Cron Jobs** → *Once Per Week* → Command:
   `/usr/local/bin/php /home/YOUR_CPANEL_USERNAME/public_html/api/refresh-reviews.php`
   (your cPanel username is shown in the cPanel sidebar)

Google only returns up to 5 reviews per request. The script keeps the ones with 4★ or more and real text, newest first. Google's Maps Platform terms limit how long review content may be stored, so a **weekly** refresh is the safer schedule (it also keeps the section fresh).

---

## 8. Getting found on Google (do these in the first week)

The site is built for search:
- A separate page and keyword-focused title for each service, e.g. "Soil Testing & Geotechnical Investigation in Hyderabad"
- IS codes listed on every service page, plus FAQs
- Structured data that tells Google you are a NABL-accredited lab in Hyderabad
- A sitemap, and fast loading on mobile

Rankings, though, also depend on things outside the website:

1. **Google Search Console** (https://search.google.com/search-console): add `mpadqclab.com` as a *Domain* property and verify it with the TXT record (cPanel → Zone Editor). Then go to **Sitemaps** → submit `https://mpadqclab.com/sitemap.xml`.
2. **Google Business Profile:** set the website to `https://mpadqclab.com/`. Make sure the name, address and phone match the website exactly, pick the most specific "testing laboratory" category available, list each service, and add your site photos.
3. **Reviews are the biggest local ranking factor.** After every completed job, send the client the review link: https://g.page/r/CTnzdvOgYt1TEAE/review
4. List the lab, with the same name, address and phone, on IndiaMART, Justdial, Sulekha and your builders' or engineering association directories.
5. **Optional:** to see visitors and enquiries in Google Analytics 4, send the Measurement ID (`G-XXXXXXX`) to your developer. Form submissions are already reported as `generate_lead` events.

No website can guarantee the #1 position. Accurate content plus reviews, a consistent business listing and time (typically 2–4 months) are what move a local business up for searches like *"soil testing lab Hyderabad"* or *"NABL lab near me"*.

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Form shows "Our mail server did not accept the message" | Create `no-reply@mpadqclab.com` (step 4) or ask your host whether PHP `mail()` is enabled. The enquiry is still saved in `api/storage/enquiries.csv`. |
| Emails go to Spam | Step 4 (Email Deliverability → Repair) and the Gmail filter |
| A new project/client doesn't appear | `data/*.json` has a typo: check it at jsonlint.com |
| Photos look stretched | Use landscape photos (4:3) for projects |
| Reviews not updating | Open the refresh URL from step 7.6 and read the message it shows |
| Pages look unstyled after an update | Press Ctrl + F5 to clear your browser cache |

**Reading enquiry backups:** File Manager → `api/storage/enquiries.csv` → Download → open in Excel. This folder is blocked from public access.

---

## 10. Private admin area (company documents)

**Address:** https://mpadqclab.com/admin/. It isn't linked anywhere on the public site, and Google is told not to index it.

**What it does:**
- stores company details (GSTIN, PAN, TAN, CIN, bank details and so on) with one-click **Copy** buttons
- stores documents (PDF, JPG, PNG or WebP, up to 10 MB) that admins can download or view

**Where files are kept:** in `/home2/mpadqcla/mpad-vault`, which is **outside** `public_html`. Nobody can open them by typing a web address; they can only be downloaded after logging in. cPanel's full backups include this folder.

**First-time setup (once):**
1. File Manager → `public_html/admin/config.php` → **Edit** → set `'setup_code' => 'any-secret-word'` → **Save**.
2. Open https://mpadqclab.com/admin/, enter that word, and choose your admin username and password (10+ characters, letters and numbers).
3. After that, setup is switched off automatically. You can set `setup_code` back to `''`.

**Adding staff:** Dashboard → **Admins** → enter a username and a temporary password. They must choose their own password at first login. If someone forgets theirs, another admin clicks **Reset** to give them a new temporary password.

**Security built in:**
- passwords are stored only as secure hashes
- 5 wrong attempts lock that username for 15 minutes
- you're logged out after 30 minutes of inactivity
- every login, failed login, upload, download and change is listed under **Activity**
- **Strongly recommended:** each admin should go to **My account → Set up 2-step verification** and add the key to Google Authenticator or Microsoft Authenticator

**Upload limit:** if uploads over 2 MB fail, open cPanel → **MultiPHP INI Editor** → select `mpadqclab.com` → set `upload_max_filesize` to `12M` and `post_max_size` to `14M`.

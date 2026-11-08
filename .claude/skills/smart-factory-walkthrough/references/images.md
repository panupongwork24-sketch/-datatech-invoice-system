# Popup images – sourcing and processing

## Allowed sources (best first)
1. Real screenshots of the user's own systems / own photos the user sends in chat (saved under the uploads path) or puts in Drive. Remove names, prices, customer data.
2. The user's own illustrations (crop the relevant part of an infographic; avoid AI text typos and invented numbers such as "$13,576,700 saved").
3. Canva AI (`mcp__Canva__generate-image`, aspect LANDSCAPE_4_3, prompt ends with "No logos, no brand names, no readable text"). Poll `get-generate-image-job`; the result file is only a 199 px preview → send the user the `https://www.canva.com/M/<mediaId>` links to download the full images and send them back. Canva *stock* photos must not be exported as stand-alone files (licence).
4. Unsplash / Pexels only through their official APIs with the user's key (no scraping, no fake User-Agent).
5. Wikimedia Commons CC0/CC BY/BY-SA: keep the on-screen credit "Author · Licence · Wikimedia Commons"; BY-SA modified files stay BY-SA.

## Never
Customer-named files/projects, competitor or vendor marketing images without permission, partner logo slides, invoices/receipts, personal photos, stock dashboard templates from other companies.

## Google Drive
- Search: `mcp__Google_Drive__search_files` with `mimeType contains 'image/' and (title contains '…')`, `excludeContentSnippets: true`.
- Download: `download_file_content` → result saved as JSON (`content` base64) in tool-results → decode with `python3 -I` into a new scratch dir, then make 1400 px thumbnails and view them.

## Processing
```python
from PIL import Image
im = Image.open(src).convert('RGB')
im = im.crop(box)            # popup shows ~436x520 with object-fit: cover – keep the subject central
im.thumbnail((960, 960))
im.save('assets/img/<device-id>.jpg', quality=82, optimize=True, progressive=True)
```
Then: `content.json` → `devices.<id>.credit` ("" for own/AI images), `credits.md` row, rebuild, open the popup (`window.__sf.openModal('<id>')`) and look at the screenshot.

## Current device ids
visitor-kiosk, boom-barrier, visitor-badge, rfid-dock-portal, pallet-rfid-tag, dock-status-light, rfid-label-printer, rtls-rfid-anchor, ai-vision-camera-wh, esl-shelf, pick-to-light, amr, amr-charging, conveyor-dock, mes-dashboard, digital-wi, mold-qr, ai-vision-inspection, auto-label, esl-lineside, rfid-kanban, cmms, paperless-pr-po, hr-system (Skill Management), fiber-backbone, network-rack, lan-access

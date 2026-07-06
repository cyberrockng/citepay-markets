# CitePay Demo Video — Production Recording Guide
> Supersedes the localhost flow in DEMO_SCRIPT.md for the final submission video.
> Target: ≤3:00 · recorded against the LIVE site · screen + voice together.

## Setup (15 min before recording)
- OBS Studio or Win+Alt+R · 1920×1080 · browser zoom 100% · bookmarks bar hidden (Ctrl+Shift+B) · Focus Assist ON.
- Pre-open 8 tabs in order: ① landing ② /ask ③ /market ④ /demo ⑤ /proof ⑥ /traction ⑦ tollgate.gudman.xyz/answers/0x44dee3a04a09ac6c ⑧ testnet.arcscan.app/tx/0xcb617e0eda3bb4124abc41a06c2c313f42b8ea0aad2f90a6e7c4c73246a73629
- MANDATORY dry run of the full click path first — especially /ask (~40s pipeline). If /ask payment UX is clunky on camera, run that beat on /demo instead (auto-runs, no wallet) and keep everything else identical.
- Voice: 20% slower than natural. Pause between scenes (edits hide in pauses). 2–3 full takes; repeat a flubbed sentence and keep rolling.

## Scenes — navigation + voiceover

**S1 · 0:00–0:15 · Tab① landing (slow scroll)**
"AI agents cite people's work every day — without permission, without payment, without accountability. CitePay fixes all three: every citation becomes a real payment, and every decision becomes a public receipt, anchored on-chain."

**S2 · 0:15–0:35 · Tab② /ask — type 'What is x402 and how does it enable micropayments?', budget $0.05, click Ask; point at 402/payment indicator**
"I'm acting as an agent with a five-cent budget. I ask a question — and the server refuses to answer without payment. That's HTTP 402. My agent pays real USDC through Circle Gateway on Arc testnet, automatically. No card, no invoice — protocol money."

**S3 · 0:35–1:05 · Tab③ /market (while the query processes — hides the 40s wait); hover price, bond badge, content hash**
"While Claude scores sources against my question, here's the market it's choosing from. Creators register their articles and datasets, set a price per citation, and can post a credibility bond. Each source carries a content hash — remember that hash; it becomes important in a minute."

**S4 · 1:05–1:30 · back to Tab② results; point at a PAY, then a REFUSE**
"Decisions are in. These sources got PAID — the USDC is moving right now, one transaction each. These got REFUSED — too expensive or too weak for this query. And here's the part that matters: every decision, paid or refused, mints a public receipt."

**S5 · 1:30–1:55 · open a PAY receipt; scroll hashes + Arcscan link**
"The receipt is the product. Query hash, the content's hash at decision time, and the payment transaction on Arcscan. Anyone can recompute these hashes from the evidence. Nobody — including us — can quietly rewrite history."

**S6 · 1:55–2:15 · Tab④ /demo; point at tamper/challenge proof when it fires**
"So what happens if a creator silently edits their content after being cited? Watch the challenge: hash at decision time versus hash now. They differ — challenge succeeds, reputation drops. Pure cryptography. No AI judge, no committee, no appeals to vibes."

**S7 · 2:15–2:35 · Tab⑤ /proof then Tab⑥ /traction (brief scrolls)**
"And none of this is staged. Confirmed paid citations are read live from the chain, no database to trust. The traction page shows reconciled queries, agent decisions, creators paid, and real USDC routed."

**S8 · 2:35–2:55 · Tab⑦ Tollgate answer → flick to Tab⑧ Arcscan payout**
"And this week, the loop went external. CitePay paid Tollgate — an entirely different agent network — as its first outside reader. Tollgate's answer cited CitePay back, so part of our own payment returned to us as creator earnings. Two agent networks paying each other, one wallet, all on-chain, settled in three blocks."

**S9 · 2:55–3:00 · back to Tab① landing**
"CitePay Markets. The citation economy — running for real. Come verify every claim yourself."

## Pacing notes
- Scene 3 is the accordion: compress the market explanation if over time. Never cut the receipt (S5) or the Tollgate loop (S8).
- The 40-second pipeline is a feature when narrated, dead air when not — S3 exists to absorb it.
- Numbers in S7 were live as of Jul 4; glance at /traction before recording and say whatever it shows that day.

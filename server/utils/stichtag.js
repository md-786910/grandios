/**
 * Stichtag (go-live cutoff date) — sourced from the environment, not the DB/UI.
 *
 * Set `STICHTAG=YYYY-MM-DD` in the server's .env. When set:
 *  - the WAWI order sync only pulls/counts orders dated on/after it (pre-cutoff
 *    history is owned by the Excel import),
 *  - the bonus page only shows/groups post-cutoff orders.
 * When unset, returns null → everything behaves as before (no cutoff).
 *
 * @returns {Date|null}
 */
function getStichtag() {
  const raw = process.env.STICHTAG;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** WAWI domain string form ("YYYY-MM-DD HH:MM:SS"), or null when unset. */
function getStichtagWawiString() {
  const d = getStichtag();
  return d ? d.toISOString().replace("T", " ").substring(0, 19) : null;
}

module.exports = { getStichtag, getStichtagWawiString };

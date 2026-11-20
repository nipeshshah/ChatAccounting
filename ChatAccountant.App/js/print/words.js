/* js/print/words.js — amount in words (Indian lakh / crore) */
// ---- amount in words (Indian lakh/crore grouping): 1180 -> "Rupees One Thousand One Hundred Eighty Only" ----
const W_ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];

const W_TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

function wordsBelow100(x){ return x < 20 ? W_ONES[x] : W_TENS[Math.floor(x / 10)] + (x % 10 ? " " + W_ONES[x % 10] : ""); }

function wordsBelow1000(x){ const h = Math.floor(x / 100), r = x % 100; return (h ? W_ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? wordsBelow100(r) : ""); }

function indianWords(x){
  if(x === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(x / 1e7); x %= 1e7;
  const lakh = Math.floor(x / 1e5); x %= 1e5;
  const thou = Math.floor(x / 1e3); x %= 1e3;
  if(crore) parts.push(indianWords(crore) + " Crore");
  if(lakh) parts.push(wordsBelow100(lakh) + " Lakh");
  if(thou) parts.push(wordsBelow100(thou) + " Thousand");
  if(x) parts.push(wordsBelow1000(x));
  return parts.join(" ");
}

function amountInWords(n){
  n = Math.round(Number(n) * 100) / 100;
  if(!(n >= 0) || n >= 1e12) return "";
  const rupees = Math.floor(n + 1e-9), paise = Math.round((n - rupees) * 100);
  return "Rupees " + indianWords(rupees) + (paise ? " and " + wordsBelow100(paise) + " Paise" : "") + " Only";
}

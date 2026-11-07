/** Same theme the app used with the Tailwind CDN, now compiled once (so it works offline). */
module.exports = {
  content: ['../wwwroot/index.html', '../wwwroot/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        corporate: { navy:'#0B192C', darker:'#06101E', subtle:'#152438', surface:'#1E293B', border:'#2A3F5F' },
        fintech: { blue:'#2563EB', blueDark:'#1D4ED8', cyan:'#38BDF8', blueSoft:'#EBF2FF', emerald:'#059669', emeraldLight:'#ECFDF5', ruby:'#DC2626', rubyLight:'#FEF2F2', slate:'#F8FAFC', muted:'#64748B' }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans','-apple-system','BlinkMacSystemFont','sans-serif'],
        mono: ['JetBrains Mono','monospace']
      },
      boxShadow: {
        'fintech-sm': '0 1px 3px 0 rgba(11,25,44,0.05), 0 1px 2px -1px rgba(11,25,44,0.05)',
        'bubble-bot': '0 2px 8px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.02)',
        'bubble-user': '0 4px 12px rgba(0,102,255,0.22)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')]
};

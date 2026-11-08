
export function GET() {
  const vcard = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Alejandro;Kurt;;;",
    "FN:Kurt Alejandro",
    "ORG:bolimgfx",
    "TITLE:Graphic Designer & Visual Creator",
    "TEL;TYPE=CELL:+639241172360",
    "EMAIL;TYPE=INTERNET:kurtbolim07@gmail.com",
    "URL:https://bolimgfx.vercel.app/",
    "X-SOCIALPROFILE;TYPE=Behance:https://www.behance.net/kurtalejandro",
    "X-SOCIALPROFILE;TYPE=Instagram:https://www.instagram.com/bolimgfx/",
    "X-SOCIALPROFILE;TYPE=Facebook:https://www.facebook.com/kurtbolim",
    "X-SOCIALPROFILE;TYPE=LinkedIn:https://www.linkedin.com/in/kurt-alejandro-683639395/",
    "NOTE:Graphic Design\\nPortfolio: https://bolimgfx.vercel.app/",
    "END:VCARD",
    "",
  ].join("\r\n");

  return new Response(vcard, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition":
        'inline; filename="Kurt-Alejandro.vcf"',
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

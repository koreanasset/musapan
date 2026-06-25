import { runStockBrief, getOutboundIp } from "../scripts/lib/stockBrief.js";

export default async function handler(req, res) {
  if (req.query.debug === "1") {
    res.status(200).json({
      outboundIp: await getOutboundIp(),
      hasAppKey: !!process.env.KIWOOM_APP_KEY,
      appKeyLen: (process.env.KIWOOM_APP_KEY || "").length,
      hasAppSecret: !!process.env.KIWOOM_APP_SECRET,
      appSecretLen: (process.env.KIWOOM_APP_SECRET || "").length,
      hasCronSecret: !!process.env.CRON_SECRET,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  try {
    const result = await runStockBrief(process.env);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

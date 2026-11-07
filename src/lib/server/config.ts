import "server-only";

export const serverConfig = {
  secretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  vapidPublic: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  vapidPrivate: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "https://example.com",
  cronSecret: process.env.CRON_SECRET ?? "",
};

export const isPushConfigured = () => Boolean(serverConfig.vapidPublic && serverConfig.vapidPrivate && serverConfig.secretKey);

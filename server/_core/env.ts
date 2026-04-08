export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Simple email/password auth (alternative to OAuth)
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  enformionApName: process.env.ENFORMION_AP_NAME ?? "",
  enformionApPassword: process.env.ENFORMION_AP_PASSWORD ?? "",
};

import type { NextConfig } from 'next';
const config:NextConfig={transpilePackages:['@ikimetr/core','@ikimetr/database','@ikimetr/connectors'],serverExternalPackages:['better-sqlite3'],...(process.env.IKIMETR_SMOKE_DISABLE_TURBO_CACHE==='1'?{experimental:{turbopackFileSystemCacheForDev:false}}:{})};
export default config;

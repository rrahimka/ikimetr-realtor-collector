import type { NextConfig } from 'next';
const config:NextConfig={transpilePackages:['@ikimetr/core','@ikimetr/database','@ikimetr/connectors'],serverExternalPackages:['better-sqlite3']};
export default config;

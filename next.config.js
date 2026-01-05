/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['dnivljiyahzxpyxjjifi.supabase.co'],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  webpack: (config, { isServer, webpack }) => {
    // Fix for react-pdf and pdfjs-dist
    if (!isServer) {
      // Client-side: ignore canvas and other Node.js modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        assert: false,
        http: false,
        https: false,
        os: false,
        url: false,
        zlib: false,
        canvas: false,
      };

      // Ignore canvas module on client-side only
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };

      // Ignore canvas to avoid build issues (client-side only)
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^canvas$/,
        })
      );
    }
    // Server-side: allow canvas (needed for PDF to image conversion)

    return config;
  },
};

module.exports = nextConfig

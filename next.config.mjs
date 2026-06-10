/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1','192.168.85.1','172.20.10.2'],
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.ts'
    }
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/vi/**'
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**' // Google user content often follows this pattern
      },
      {
        protocol: 'https',
        hostname: 'imgs.search.brave.com',
        port: '',
        pathname: '/**' // Brave search cached images
      },
      {
        protocol: 'https',
        hostname: 'www.google.com',
        port: '',
        pathname: '/s2/favicons/**' // Google Favicon API
      }
    ]
  }
}

export default nextConfig


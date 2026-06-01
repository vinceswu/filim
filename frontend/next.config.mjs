/** @type {import('next').NextConfig} */
const nextConfig = {

    experimental: {
        proxyTimeout: 180_000,
        workerThreads: false,
        cpus: 1,
        memoryBasedWorkersCount: true
    },
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**"
            }
        ]
    },
    async redirects() {
        return [
            {
                source: "/anime/:id",
                destination: "/show/:id",
                permanent: false
            }
        ];
    },
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/:path*`
            }
        ];
    }
};

export default nextConfig;


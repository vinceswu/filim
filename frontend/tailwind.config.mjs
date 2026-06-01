/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            colors: {
                background: "#141414",
                playerSheet: "#1a1a1a",
                foreground: "#e5e5e5",
                ncyan: {
                    DEFAULT: "#06b6d4",
                    dark: "#0891b2",
                    light: "#22d3ee"
                },
                nred: {
                    DEFAULT: "#dc2626",
                    dark: "#b91c1c",
                    light: "#ef4444"
                },
                surface: {
                    DEFAULT: "#181818",
                    hover: "#232323",
                    light: "#2a2a2a"
                }
            },
            boxShadow: {
                dialog: "0 16px 60px rgba(0,0,0,0.8)"
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"]
            },
            animation: {
                "splash-logo": "splash-logo 2.5s cubic-bezier(0.25, 1, 0.5, 1) forwards"
            },
            keyframes: {
                "splash-logo": {
                    "0%": {
                        transform: "scale(0.8) translate3d(0,0,0)",
                        opacity: "0",
                        filter: "blur(10px) brightness(1)"
                    },
                    "15%": {
                        transform: "scale(1.02) translate3d(0,0,0)",
                        opacity: "1",
                        filter: "blur(0px) brightness(1)"
                    },
                    "75%": {
                        transform: "scale(1.1) translate3d(0,0,0)",
                        opacity: "1",
                        filter: "blur(0px) brightness(1.2)"
                    },
                    "100%": {
                        transform: "scale(1.1) translate3d(0,0,0)",
                        opacity: "1",
                        filter: "blur(0px) brightness(1.2)"
                    }
                }
            }
        }
    },
    plugins: []
};

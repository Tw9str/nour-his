import type {NextConfig} from 'next';
const config:NextConfig={poweredByHeader:false,distDir:process.env.NOUR_BUILD_DIR||'.next',async headers(){return[{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Cross-Origin-Resource-Policy',value:'same-origin'},{key:'Cross-Origin-Opener-Policy',value:'same-origin'}]}];}};
export default config;

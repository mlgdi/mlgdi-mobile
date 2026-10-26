import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// 影响端范围：全端
// H5 调试端口固定 5173（与后端 CORS 白名单、文档一致），
// 且必须 --host 才能在手机上用局域网 IP 打开。
export default defineConfig({
  plugins: [uni()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})

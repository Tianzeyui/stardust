import { createApp } from 'vue'
import { createPinia } from 'pinia'
import WebOSPlugin from '@stread/web-os'
import '@stread/web-os/dist/web-os.css'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(WebOSPlugin)

app.mount('#app')

import Chat from './views/Chat.js'

const { createApp, defineAsyncComponent } = Vue
const { createRouter, createWebHashHistory } = VueRouter

const Admin = defineAsyncComponent(() => import('./views/Admin.js'))

const routes = [
  { path: '/', component: Chat },
  { path: '/admin', component: Admin }
]

// Router Config
const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// Create App
const app = createApp({
    template: '<router-view></router-view>'
})

app.use(router)
app.use(ElementPlus)
app.mount('#app')

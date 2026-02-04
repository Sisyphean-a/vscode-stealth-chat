import Chat from './views/Chat.js';
import Admin from './views/Admin.js';

const { createApp } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

// Routes
const routes = [
  { path: '/', component: Chat },
  { path: '/admin', component: Admin }
];

// Router Config
const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// Create App
const app = createApp({
    template: '<router-view></router-view>'
});

app.use(router);
app.use(ElementPlus); // Use global Element Plus
app.mount('#app');

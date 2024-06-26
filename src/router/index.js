import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'index',
      component: () => import('@/pages/index'),
      meta: {
        title: '首页',
        keepAlive: true
      }
    }
  ]
})

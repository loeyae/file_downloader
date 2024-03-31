import Vue from 'vue'
import App from './App.vue'
import ElementUI from 'element-ui'
import './styles.scss'

import router from './router'

Vue.use(ElementUI)

Vue.config.productionTip = false
window.ipcRenderer = window.require('electron').ipcRenderer
window.$remote = window.require('electron').remote

new Vue({
  router,
  render: h => h(App),
}).$mount('#app')

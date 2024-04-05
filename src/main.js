import Vue from 'vue'
import App from './App.vue'
import ElementUI from 'element-ui'
import './styles.scss'

import router from './router'
import path from "path";

Vue.use(ElementUI)

Vue.config.productionTip = false
window.ipcRenderer = window.require('electron').ipcRenderer
window.$remote = window.require('electron').remote
const logger = require('electron-log')
logger.transports.file.level = "info"
logger.transports.file.maxSize = 10 * 1024 * 1024
if (process.env.NODE_ENV === 'production') {
  logger.transports.console.level = false
}
logger.transports.file.resolvePath = () => {
  if (process.env.NODE_ENV !== 'production') {
    return path.join(path.dirname('D:\\work\\src\\project\\excel_downloader\\src'), 'render.log')
  }
  return 'render.log'
}
Vue.prototype.$logger = logger

new Vue({
  router,
  render: h => h(App),
}).$mount('#app')

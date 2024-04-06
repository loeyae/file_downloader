<template>
  <div>
    <el-container>
      <el-header>请选择excel文件</el-header>
      <el-main>
        <el-row>
          <el-col :span="24">
            <el-button size="small" @click="selectExcel" type="primary">选择excel文件</el-button>
            <el-button size="small" @click="start" type="danger">开始下载</el-button>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="24">
            <el-table :data="excelData" style="width: 100%">
              <el-table-column prop="id" label="序号" width="180">
              </el-table-column>
              <el-table-column prop="name" label="名称" width="180">
              </el-table-column>
              <el-table-column prop="url" label="原图片">
                <template slot-scope="scope">
                  <el-image :src="scope.row.url" style="width: 160px; height: 120px;" lazy></el-image>
                </template>
              </el-table-column>
              <el-table-column prop="progress" label="进度">
                <template slot-scope="scope">
                  <el-progress type="circle" :width="80" :percentage="scope.row.progress">
                    <div slot="placeholder" class="image-slot">
                      加载中<span class="dot">...</span>
                    </div>
                  </el-progress>
                </template>
              </el-table-column>
              <el-table-column prop="savedPath" label="本地图片">
                <template slot-scope="scope">
                  <el-image :src="formartPath(scope.row.savedPath)" style="width: 160px; height: 120px;" lazy>
                    <div slot="error" class="image-slot">
                      等待下载<span class="dot">...</span>
                    </div>
                  </el-image>
                </template>
              </el-table-column>
              <el-table-column fixed="right" label="操作" width="200">
                <template slot-scope="scope">
                  <el-button size="mini" v-if="scope.row.downloadState==='init'" @click="download(scope.row)">下载
                  </el-button>
                  <el-button size="mini" v-if="scope.row.downloadState==='interrupted'" @click="download(scope.row, true)">
                    重新下载
                  </el-button>
                  <el-button size="mini" v-if="scope.row.downloadState==='pause'" @click="download(scope.row)">继续下载
                  </el-button>
                  <el-button size="mini" type="info" v-if="scope.row.downloadState==='downloading'" :loading="true">
                    等待下载
                  </el-button>
                  <el-button size="mini" type="primary" v-if="scope.row.downloadState==='progressing'" :loading="true">
                    下载中
                  </el-button>
                  <el-button size="mini" type="success" v-if="scope.row.downloadState==='completed'"
                             @click="openDir(scope.row.savedPath)">浏览文件
                  </el-button>
                  <el-button size="mini" v-if="scope.row.downloadState==='completed'"
                             @click="download(scope.row, true)">重新下载
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-col>
        </el-row>
      </el-main>
    </el-container>
  </div>
</template>

<script>
const nodeXlsx = window.require('node-xlsx')
const path = window.require('path')
export default {
  name: 'HelloWorld',
  props: {
    msg: String
  },
  data() {
    return {
      timer: null,
      tableHeader: [],
      outputPath: './download',
      downloadPath: '',
      excelData: [],
      downloadQueue: [],
    }
  },
  methods: {
    formartPath(path) {
      return 'atom://'+ encodeURIComponent(path)
    },
    downloadFile: (url, fileName, fingerPrint) => window.ipcRenderer.send('download-file', url, fileName, fingerPrint),//下载文件
    watchDownloadFileState: (callback) => window.ipcRenderer.on('watch-download-file-state', callback),//推送给渲染进程 下载过程中的状态
    getDownloadFileState: (fingerPrint, url, returnType) => window.ipcRenderer.invoke('get-download-file-state', fingerPrint, url, returnType),//接收渲染进程 获取下载状态 的通知 返回下载状态字符串
    setDownloadFileState: (state, fingerPrint, url) => window.ipcRenderer.send('set-download-file-state', state, fingerPrint, url),//接收渲染进程 设置下载状态（暂停、恢复、取消） 的通知
    getDownloadFileSavedPath: (fingerPrint) => window.ipcRenderer.invoke('get-download-file-saved-path', fingerPrint),//接收渲染进程 获取某个下载文件的下载存放路径 的通知 返回下载存放路径
    openDir: (path, isOpenFile) => window.ipcRenderer.invoke('open-dir', path, isOpenFile),//从渲染进程中打开目录，并返回结果
    fsExists: (path) => window.ipcRenderer.invoke('fs-exists', path),//从渲染进程中通知主进程判断一下文件路径是否存在，主进程返回结果
    fsDelete: (path) => window.ipcRenderer.invoke('fs-delete', path),//从渲染进程中通知主进程删除文件，主进程返回结果
    reset() {
      this.excelData = []
      this.downloadQueue = []
      this.timer && clearInterval(this.timer)
      this.timer = null
      this.$logger.info('重置', this.timer)
    },
    selectExcel() {
      window.ipcRenderer.send('open-excel-dialog', 'excel');
      window.ipcRenderer.on('selected-excel', (event, filePath) => {
        if (!filePath) {
          return
        }
        this.reset()
        this.downloadPath = path.resolve(path.join(this.outputPath, path.basename(filePath, path.extname(filePath))))
        const sheets = nodeXlsx.parse(filePath)
        let id = 1
        sheets.forEach(sheet => {
          const row = sheet.data
          for (let i = 0; i < row.length; i++) {
            const item = row[i]
            if (item.length > 1) {
              this.excelData.push({
                id: id++,
                name: item[0],
                url: item[1],
                progress: 0,
                remainderTime: 0,
                speedStr: '0b/s',
                downloadState: 'init'
              })
            }
          }
        })
      })
    },
    start() {
      if (this.timer) {
        this.$notify({
          title: '提示',
          message: '已开始下载',
          type: 'warning'
        })
        return
      }
      this.timer = setInterval(() => {
        this.$logger.info('开始下载', this.downloadQueue)
        if (this.downloadQueue.length < 10) {
          const index = this.excelData.findIndex(item => item.downloadState === 'init')
          const item = this.excelData[index]
          if (item) {
            this.excelData[index].downloadState = 'downloading'
            this.download(item)
          } else {
            this.$logger.info('下载完成')
            clearInterval(this.timer)
            this.timer = null
          }
        }
      }, 1000)
    },
    pauseForSeconds(ms) {
      return new Promise(resolve => {
        setTimeout(resolve, ms)
      })
    },
    download(data, reload = false) {
      const url = data.url
      const name = data.name
      const type = url.slice(url.lastIndexOf('.') + 1)
      const filePath = path.join(this.downloadPath, name + "." + type)
      const index = this.excelData.findIndex(item => item.name === name)
      if (reload) {
        if (this.fsExists(filePath)) {
          this.fsDelete(filePath)
        }
        this.$set(this.excelData[index], 'savedPath', null)
      }
      const isSuccess = this.electronDownloadFile(url, filePath, name, ({
                                                                          fileName,
                                                                          remainderTime,
                                                                          progress,
                                                                          speedStr
                                                                        }) => {
        if (name !== fileName) return
        const index = this.excelData.findIndex(item => item.name === fileName)
        let excelRow = this.excelData[index]
        excelRow.progress = progress;//下载进度条
        excelRow.remainderTime = remainderTime;//下载剩余时间
        excelRow.speedStr = speedStr;//下载速度
        this.$set(this.excelData, index, excelRow)
      }, (fileName, key, value) => {
        if (name !== fileName) return
        const index = this.excelData.findIndex(item => item.name === fileName)
        let excelRow = this.excelData[index]
        excelRow[key] = value;
        this.$set(this.excelData, index, excelRow)
        return data[key]
      })
      this.$logger.info('下载文件', name, isSuccess)
      if (isSuccess) {
        data.progress = 100
      }
      this.$set(this.excelData, index, data)
    },
    /**
     * electron下载文件
     * @param {string} url 下载的文件路径
     * @param {string} fileName 下载的文件名称
     * @param {string} fingerPrint 下载的文件指纹
     * @param {function} progressCallBack 下载进度函数回调
     * @param {function} setAttribute 需要设置属性的函数回调
     */
    async electronDownloadFile(url, fileName, fingerPrint, progressCallBack, setAttribute) {
      if (!setAttribute) return

      /**
       * 定义回调函数获取：下载剩余时间，下载进度，下载速度
       * @param {Number} remainderTime 下载剩余时间
       * @param {Number} progress 下载进度
       * @param {String} speedStr 下载速度
       */
      const callBackUpdateFn = ({fileName, remainderTime, progress, speedStr}) => {

        progressCallBack && progressCallBack({fileName, remainderTime, progress, speedStr})
      }
      const progressCallback = this.uploadDownFileProgressFn(callBackUpdateFn)
      const that = this
      /**
       * 定义一个下载文件的方法
       * @param {Boolean} onlyGetWatchResult 仅获取监听结果（因为恢复下载后只需要获取监听结果即可）
       */
      const downloadFn = (onlyGetWatchResult = false) => { //

        return new Promise((resolve) => {
          //1- 下载文件
          if (onlyGetWatchResult === false) {
            setAttribute(fingerPrint, 'progress', 0)//设置进度为0
            that.downloadQueue.push(fingerPrint)
            that.downloadFile(url, fileName, fingerPrint)
          }
          //2- 获取监听下载过程中的状态
          that.watchDownloadFileState((event, state, info) => {
            setAttribute(info.fingerPrint, 'downloadState', state) //设置下载状态
            switch (state) {
              case "progressing": //下载中
                progressCallback(info)
                break;
              case "pause"://下载暂停
                that.setDownloadFileState('resume', info.fingerPrint, info.url)
                resolve(false)
                break;
              case "cancelled"://下载被取消了
                this.$logger.info('取消下载', info.fingerPrint)
                resolve(true)
                that.clearDownloadQueue(info.fingerPrint)
                break;
              case "interrupted"://下载中断
                resolve(false)
                break;
              case "completed": //下载完成
                this.$logger.info('完成下载', info.fingerPrint, info.saveFilePath)
                resolve(true)
                setAttribute(info.fingerPrint, 'savedPath', info.saveFilePath)
                that.clearDownloadQueue(info.fingerPrint)
                break;
              default://没下载过就开始下载
                resolve(false)
                break;

            }
          })

        })

      }

      const isDownloaded = await this.fsExists(fileName)
      if (isDownloaded) {
        this.$logger.info('文件已存在', fileName)
        setAttribute(fingerPrint, 'downloadState', 'completed')
        setAttribute(fingerPrint, 'savedPath', fileName)
        this.clearDownloadQueue(fingerPrint)
        return true
      }

      //1- 获取当前文件在主进程的下载状态
      const {state: downloadState} = await this.getDownloadFileState(fingerPrint, url, 'obj');
      //2- 根据下载状态作出对应的响应
      switch (downloadState) {
        case "progressing": //下载中
          this.$logger.info('下载中', fingerPrint)
          //设置暂停下载
          this.setDownloadFileState('pause', fingerPrint, url)
          return false
        case "completed": //下载完成
          this.$logger.info('下载完成', fingerPrint)
          //获取文件下载后的保存路径
          // eslint-disable-next-line no-case-declarations
          const savePath = await this.getDownloadFileSavedPath(fingerPrint);
          setAttribute(fingerPrint, 'savedPath', savePath)
          //路径不存在说明被手动删除了，重新下载
          if (!savePath) {
            this.$notify({
              title: '提示',
              message: '文件不存在，正在重新下载！',
              offset: 100
            });
            return await downloadFn()//下载文件
          }
          //路径存在就判断文件是否真实存在本地
          // eslint-disable-next-line no-case-declarations
          const isExist = await this.fsExists(savePath);
          if (!isExist) {//不存在本地，说明下载过，但被手动删除了，取消此文件的上次下载记录，重新下载
            this.setDownloadFileState('cancel', fingerPrint, url)//设置取消下载
            return await downloadFn()//下载文件
          }
          return true
        case "cancelled"://下载被取消
          this.$logger.info('下载取消', fingerPrint)
          return false
        case "interrupted"://下载中断
          this.$notify({
            title: '提示',
            message: `此文件被暂停下载了，请前往恢复下载`,
            offset: 100,
            duration: 1500,
          });

          return await downloadFn(true)//获取文件的下载过程信息
        default://没下载过就开始下载
          this.$logger.info('下载开始', fingerPrint)
          return await downloadFn()//下载文件

      }

    },
    clearDownloadQueue(fingerPrint) {
      this.$logger.info("downloadQueue", this.downloadQueue)
      const index = this.downloadQueue.findIndex(item => item === fingerPrint)
      if (index > -1) {
        this.downloadQueue.splice(index, 1)
      }
    },
    /** 根据下载项目的总大小（以字节为单位）和 下载项目的接收字节 计算：下载剩余时间，下载进度，下载速度
     * @param {Funciton} callBack 回调函数，函数参数必传一个对象{total,loaded}，返回一个对象，包含下载剩余时间，下载进度，下载速度
     */
    uploadDownFileProgressFn(callBack) {
      //文件的上传进度、上传速度、上传剩余时间计算
      let lastTime = 0;//上一次计算剩余时间
      let lastSize = 0;//上一次计算的文件大小
      return (e) => {
        if (!e.total || !e.loaded) return
        if (lastTime == 0) {
          lastTime = new Date().getTime();
          lastSize = e.loaded
          return
        }
        //计算时间间隔
        let nowTime = new Date().getTime();
        let intervalTime = (nowTime - lastTime) / 1000;//时间单位为毫秒，需要转化为秒
        let intervalSize = e.loaded - lastSize;
        //重新赋值以便于下一次计算
        lastTime = nowTime;
        lastSize = e.loaded;
        //计算速度
        let speed = parseInt(intervalSize / intervalTime);
        const bSpeed = parseInt(speed);
        let units = 'b/s'
        if ((speed / 1024) > 1) {
          speed = parseInt(speed / 1024);
          units = 'k/s'
        }
        if ((speed / 1024) > 1) {
          speed = parseInt(speed / 1024);
          units = 'M/s'
        }
        //上传剩余时间
        let remainderTime = bSpeed ? Math.ceil(((e.total - e.loaded) / bSpeed)) : 0;
        if (remainderTime < 0 || !remainderTime) {
          remainderTime = 0;
        }
        remainderTime = parseInt(remainderTime)
        const fileName = e.fingerPrint
        //上传进度
        const progress = parseInt((e.loaded / e.total) * 100);
        //上传速度
        const speedStr = speed + units;
        callBack && callBack({fileName, remainderTime, progress, speedStr})
      }
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  display: inline-block;
  margin: 0 10px;
}

a {
  color: #42b983;
}
</style>

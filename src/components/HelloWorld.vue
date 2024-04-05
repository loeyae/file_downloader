<template>
  <div>
    <el-container>
      <el-header>请选择excel文件</el-header>
      <el-main>
        <el-row>
          <el-col :span="24">
            <el-button size="small" @click="selectExcel" type="primary">选择excel文件</el-button>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="24">
            <el-table :data="excelData" style="width: 100%">
              <el-table-column prop="id" label="编号" width="80">
              </el-table-column>
              <el-table-column prop="name" label="名称" width="180">
              </el-table-column>
              <el-table-column prop="url" label="链接">
              </el-table-column>
              <el-table-column prop="progress" label="下载进度">
              </el-table-column>
              <el-table-column prop="path" label="下载后地址"></el-table-column>
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
      tableHeader: [],
      outputPath: './download',
      excelData: [],
      downloadQueue:[],
    }
  },
  methods: {
    downloadFile: (url,fileName,fingerPrint) => window.ipcRenderer.send('download-file', url,fileName,fingerPrint),//下载文件
    watchDownloadFileState: (callback) => window.ipcRenderer.on('watch-download-file-state', callback),//推送给渲染进程 下载过程中的状态
    getDownloadFileState: (fingerPrint,url,returnType) => window.ipcRenderer.invoke('get-download-file-state',fingerPrint,url,returnType),//接收渲染进程 获取下载状态 的通知 返回下载状态字符串
    setDownloadFileState: (state,fingerPrint,url) => window.ipcRenderer.send('set-download-file-state',state,fingerPrint,url),//接收渲染进程 设置下载状态（暂停、恢复、取消） 的通知
    getDownloadFileSavepath: (fingerPrint) => window.ipcRenderer.invoke('get-download-file-savepath',fingerPrint),//接收渲染进程 获取某个下载文件的下载存放路径 的通知 返回下载存放路径
    openDir: (path,isOpenFile) => window.ipcRenderer.invoke('open-dir',path,isOpenFile),//从渲染进程中打开目录，并返回结果
    fsExists: (path) => window.ipcRenderer.invoke('fs-exists',path),//从渲染进程中通知主进程判断一下文件路径是否存在，主进程返回结果
    selectExcel() {
      window.ipcRenderer.send('open-excel-dialog', 'excel');
      window.ipcRenderer.on('selected-excel', (event, filePath) => {
        if (!filePath) {
          return
        }
        this.outputPath = path.join(this.outputPath, path.basename(filePath, path.extname(filePath)))
        this.$logger.info('进来了 导入文件 event=', event)
        let sheets = nodeXlsx.parse(filePath)
        let id = 1;
        sheets.forEach(sheet => {
          let row = sheet.data
          for (let i = 0; i < row.length; i++) {
            let item = row[i]
            if (item.length > 1) {
              this.excelData.push({id: id, name: item[0], url: item[1], status: 0, progress: 0, remainderTime: 0, speedStr: '0kb/s'})
            }
            id++
          }
        })
        this.pauseForSeconds(10000)
        for (let i = 0; i < 10; i++) {
          let item = this.excelData[i]
          if (!item) {
            return;
          }
          this.download(item)
          this.pauseForSeconds(1000)
        }
      })
    },
    pauseForSeconds(ms) {
      return new Promise(resolve => {
        setTimeout(resolve, ms)
      })
    },
    download(data) {
      let url = data.url
      let type = url.slice(url.lastIndexOf('.')+1)
      let filePath = path.join(this.outputPath, data.name+"."+type)
      data.status = 1
      const isSuccess = this.electronDownloadFile(url, filePath, data.name, ({remainderTime,progress,speedStr}) => {
        data.progress = progress;//下载进度条
        data.remainderTime = remainderTime;//下载剩余时间
        data.speedStr = speedStr;//下载速度
      },(key,value) => {
        data[key] = value;
        return data[key]
      })
      if (isSuccess) {
        data.progress = 100
      }
      this.downloadQueue.push(data.name)
      this.$set(this.excelData, this.excelData.findIndex(item => item.name = data.name), data)
    },
    /**electron下载文件
     * @param {string} url 下载的文件路径
     * @param {string} fileName 下载的文件名称
     * @param {string} fingerPrint 下载的文件指纹
     * @param {function} progressCallBack 下载进度函数回调
     * @param {function} setAttribute 需要设置属性的函数回调
     */
    async electronDownloadFile(url,fileName,fingerPrint,progressCallBack,setAttribute){
      if(!setAttribute) return

      /**定义回调函数获取：下载剩余时间，下载进度，下载速度
       * @param {Number} remainderTime 下载剩余时间
       * @param {Number} progress 下载进度
       * @param {String} speedStr 下载速度
       */
      const callBackUpdateFn = ({remainderTime,progress,speedStr}) => {

        progressCallBack && progressCallBack({remainderTime,progress,speedStr})
      }
      const progressCallback = this.uploadDownFileProgressFn(callBackUpdateFn)

      /**定义一个下载文件的方法
       * @param {Boolean} onlyGetWatchResult 仅获取监听结果（因为恢复下载后只需要获取监听结果即可）
       */
      const downloadFn = (onlyGetWatchResult = false) => { //

        return new Promise((resolve) => {
          //1- 下载文件
          if(onlyGetWatchResult === false){
            setAttribute('progress',0)//设置进度为0
            this.downloadFile(url,fileName,fingerPrint)
          }
          //2- 获取监听下载过程中的状态
          this.watchDownloadFileState((event,state,info) => {
            if(fingerPrint !== info.fingerPrint) return
            setAttribute('downloadState',state) //设置下载状态
            switch(state){
              case "progressing": //下载中
                progressCallback(info)
                break;
              case "pause"://下载暂停
                resolve(false)
                break;
              case "cancelled"://下载被取消了
                resolve(false)
                break;
              case "interrupted"://下载中断
                resolve(false)
                break;
              case "completed": //下载完成
                resolve(true)
                break;
              default://没下载过就开始下载
                resolve(false)
                break;

            }
          })

        })

      }

      //1- 获取当前文件在主进程的下载状态
      const {state:downloadState } = await this.getDownloadFileState(fingerPrint,url,'obj');
      //2- 根据下载状态作出对应的响应
      switch(downloadState){
        case "progressing": //下载中
          //设置暂停下载
          this.setDownloadFileState('pause',fingerPrint,url)
          return false
        case "completed": //下载完成
          //获取文件下载后的保存路径
          // eslint-disable-next-line no-case-declarations
          const savePath =  await this.getDownloadFileSavepath(fingerPrint);
          //路径不存在说明被手动删除了，重新下载
          if(!savePath){
            this.$notify({
              title: '操作失败',
              message: '文件不存在，正在重新下载！',
              offset: 100
            });
            return await downloadFn()//下载文件
          }
          //路径存在就判断文件是否真实存在本地
          // eslint-disable-next-line no-case-declarations
          const isExist = await this.fsExists(savePath);
          if(!isExist){//不存在本地，说明下载过，但被手动删除了，取消此文件的上次下载记录，重新下载
            window.electronAPI.setDownloadFileState('cancel',fingerPrint,url)//设置取消下载
            return await downloadFn()//下载文件
          }else {//存在本地就打开该文件
            const result = await window.electronAPI.openDir(savePath,true)//打开文件
            if(!result){//打不开就给出合理提示进行重新下载
              this.$notify({
                title: '操作失败',
                message: '文件不存在，正在重新下载！',
                offset: 100
              });
              return await downloadFn()//下载文件
            }
          }
          return false
        case "cancelled"://下载被取消
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
          return await downloadFn()//下载文件

      }

    },
    /** 根据下载项目的总大小（以字节为单位）和 下载项目的接收字节 计算：下载剩余时间，下载进度，下载速度
     * @param {Funciton} callBack 回调函数，函数参数必传一个对象{total,loaded}，返回一个对象，包含下载剩余时间，下载进度，下载速度
     */
    uploadDownFileProgressFn (callBack)  {
      //文件的上传进度、上传速度、上传剩余时间计算
      let lastTime = 0;//上一次计算剩余时间
      let lastSize = 0;//上一次计算的文件大小
      return (e) => {
        if(!e.total || !e.loaded) return
        if(lastTime == 0){
          lastTime = new Date().getTime();
          lastSize = e.loaded
          return
        }
        //计算时间间隔
        let nowTime = new Date().getTime();
        let intervalTime = (nowTime - lastTime)/1000;//时间单位为毫秒，需要转化为秒
        let intervalSize = e.loaded - lastSize;
        //重新赋值以便于下一次计算
        lastTime = nowTime;
        lastSize = e.loaded;
        //计算速度
        let speed = parseInt(intervalSize / intervalTime);
        const bSpeed = parseInt(speed);
        let units = 'b/s'
        if((speed / 1024) > 1) {
          speed = parseInt(speed / 1024);
          units = 'k/s'
        }
        if((speed / 1024) > 1) {
          speed = parseInt(speed / 1024);
          units = 'M/s'
        }
        //上传剩余时间
        let remainderTime = bSpeed ? Math.ceil(((e.total - e.loaded) / bSpeed)) : 0;
        if(remainderTime < 0 || !remainderTime){
          remainderTime = 0;
        }
        remainderTime = parseInt(remainderTime)
        //上传进度
        const progress = parseInt((e.loaded / e.total) * 100);
        //上传速度
        const speedStr = speed + units;
        callBack && callBack({remainderTime,progress,speedStr})
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

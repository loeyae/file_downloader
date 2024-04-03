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
              <el-table-column prop="status" label="状态" width="80">
                <template slot-scope="scope">
                  <el-tag v-if="scope.row.status === 0" type="info">未开始</el-tag>
                  <el-tag v-else-if="scope.row.status === 1" type="">下载中</el-tag>
                  <el-tag v-else-if="scope.row.status === 2" type="success">下载完成</el-tag>
                  <el-tag v-else type="danger">下载失败</el-tag>
                </template>
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
const REQ = window.require('request')
const fs = window.require('fs')
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
    selectExcel() {
      window.ipcRenderer.send('open-excel-dialog', 'excel');
      window.ipcRenderer.on('selected-excel', (event, filePath) => {
        if (!filePath) {
          return
        }
        console.log('进来了 导入文件 event=', event)
        let sheets = nodeXlsx.parse(filePath)
        let id = 1;
        sheets.forEach(sheet => {
          let row = sheet.data
          for (let i = 0; i < row.length; i++) {
            let item = row[i]
            if (item.length > 1) {
              this.excelData.push({id: id, name: item[0], url: item[1], status: 0, received: 0})
              if (this.downloadQueue.length < 10) {
                this.download({id: id, name: item[0], url: item[1], status: 0})
              }
            }
            id++
          }
        })
      })
    },
    download(data) {
      const that = this
      let url = data.url
      let type = url.slice(url.lastIndexOf('.')+1)
      let filePath = path.join(this.outputPath, data.name+"."+type)
      let params = {method: "GET", url: encodeURI(url)}
      let index = that.excelData.findIndex(item => item.id === data.id)
      if (this.excelData[index].received > 0) {
        params.headers = {
          Range: 'bytes=' + this.excelData[index].received
        }
      }
      var req = REQ(params)
      if (!fs.existsSync(this.outputPath)) {
        fs.mkdirSync(this.outputPath, '0777', {recursive: true})
      }
      var out = fs.createWriteStream(filePath)
      req.pipe(out)
      req.on('response', function (res) {
        console.log('downloading', url, res)
        let index = that.excelData.findIndex(item => item.id === data.id)
        that.excelData[index].status = 1
        data.status = 1
        that.downloadQueue.push(data)
      })
      req.on('data', function (chunk) {
        console.log('downloading',url, chunk.length)
        let index = that.excelData.findIndex(item => item.id === data.id)
        that.excelData[index].received += chunk.length
      })
      req.on('error', function (err) {
        console.log('download error', err)
        let index = that.excelData.findIndex(item => item.id === data.id)
        that.excelData[index].status = 3
      })
      req.on('end', function () {
        console.log('downloaded', url)
        let downloadIndex = that.downloadQueue.findIndex(item => item.id === data.id)
        that.downloadQueue.splice(downloadIndex, 1)
        let index = that.excelData.findIndex(item => item.id === data.id)
        that.excelData[index].status = 2
        that.excelData[index].path = filePath
        while (that.downloadQueue.length < 10) {
          let downloadDataIndex = that.excelData.findIndex(item => item.status === 0)
          let downloadData = that.excelData[downloadDataIndex]
          if (downloadData) {
            that.download(downloadData)
          } else {
            return
          }
        }
      })
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

import { ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
let downloadItems = []
function downloadFile(win, url, filePath, fingerPrint) {
    let dirPath = path.dirname(filePath)
    console.log("下载地址", dirPath)
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, '0777', {recursive: true})
    }
    win.webContents.session.once('will-download', (even, item, webContents) => {
        item.setSavePath(filePath)
        downloadItems.push({fingerPrint,item})
        //(2) 监听updated事件，当下载正在执行时，把下载进度发给渲染进程进行展示
        item.on('updated',(event,state) => {
            switch(state){
                case 'interrupted'://下载中断
                    win.webContents.send('watch-download-file-state',state,{//推送给渲染进程 下载过程中 的状态
                        fingerPrint:fingerPrint,
                    })
                    break;
                case 'progressing'://下载停止
                    if (item.isPaused()) { // 下载停止
                        win.webContents.send('watch-download-file-state','pause',{//推送给渲染进程 下载过程中 的状态
                            fingerPrint:fingerPrint,
                        })
                    } else if(item.getReceivedBytes() && item.getTotalBytes()) {//下载中
                        win.webContents.send('watch-download-file-state',state,{//推送给渲染进程 下载过程中 的状态
                            saveFilePath: filePath,
                            loaded: item.getReceivedBytes(),
                            total: item.getTotalBytes(),
                            fingerPrint:fingerPrint,
                        })

                    }

                    break;
            }
        })
        //(3) 监听done事件，在下载完成时打开文件。
        item.once('done',(e,state) => {
            switch(state){
                case 'completed': //下载完成
                    win.webContents.send('watch-download-file-state',state,{//推送给渲染进程 下载过程中 的状态
                        fingerPrint:fingerPrint,
                    })
                    break;
                case 'interrupted': //下载中断
                    win.webContents.send('watch-download-file-state',state,{//推送给渲染进程 下载过程中 的状态
                        fingerPrint:fingerPrint,
                    })
                    break;
                case 'cancelled': //下载取消
                    for(let i = 0; i < downloadItems.length; i++){
                        if(fingerPrint == downloadItems[i].fingerPrint && downloadItems[i].item.getURL() === url){
                            downloadItems.splice(i,1);
                            break;
                        }
                    }
                    win.webContents.send('watch-download-file-state',state,{//推送给渲染进程 下载过程中 的状态
                        fingerPrint:fingerPrint,
                    })
                    break;
            }
        })
    })
    win.webContents.downloadURL(url)
}
export const IpcMainEvent = (win, log) => {
    // 监听打开选择excel窗口
    ipcMain.on('open-excel-dialog', (event) => {
        dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
        }).then(result => {
            if (result) {
                log.info(result)
                event.sender.send('selected-excel', result.filePaths[0])
            }
        })
    });

    /**接收渲染进程 下载文件 的通知
     * @param {String} windowName 文件下载的窗体
     * @param {String} url 文件下载路径
     * @param {String} fileName  文件名称，包含后缀名（例如：图1.png）
     * @param {String} fingerPrint  文件指纹，唯一标识
     */
    ipcMain.on('download-file', function(event, url, fileName, fingerPrint) {
        downloadFile(win, url, fileName, fingerPrint);
    });

    /**接收渲染进程 获取下载状态 的通知
     * @param {String} fingerPrint 文件指纹（因为同一个文件即使不同名，下载路径也是一样的，所以需要消息指纹识别）
     * @param {String} url 文件下载路径
     * @param {String (str|obj)} returnType 返回的类型， 值为str是仅仅返回一个状态，值为obj返回一个对象
     */
    ipcMain.handle('get-download-file-state', function(event, fingerPrint, url, returnType = 'str') {
        let state = null;
        for (let i = 0; i < downloadItems.length; i++) {
            if (downloadItems[i].fingerPrint === fingerPrint) {
                const item = downloadItems[i].item;
                if (url === item.getURL()) {
                    state = item.getState();//返回 string - 当前状态。 可以是 progressing、 completed、 cancelled 或 interrupted。
                    if (state === 'progressing') {
                        if (item.isPaused()) {
                            state = 'interrupted';
                        }
                    }
                    return returnType === 'str' ? state : { state: state};
                }
            }
        }
        return returnType === 'str' ? state : { state: state};
    });

    /**接收渲染进程 设置下载状态（暂停、恢复、取消） 的通知
     * @param {String} state 需要暂停下载的路径（pause：暂停下载，stop：取消下载，resume：恢复下载）
     * @param {String} fingerPrint 需要暂停下载的文件指纹（因为同一个文件即使不同名，下载路径也是一样的，所以需要消息指纹识别）
     * @param {String} url 需要暂停下载的路径
     *
     */
    ipcMain.on('set-download-file-state', function(event, state, fingerPrint, url) {
        for (let i = 0; i < downloadItems.length; i++) {
            if (downloadItems[i].fingerPrint === fingerPrint) {
                const item = downloadItems[i].item;
                if (url === item.getURL()) {
                    switch (state) {
                        case 'pause':
                            item.pause();//暂停下载
                            break;
                        case 'cancel':
                            item.cancel();//取消下载
                            downloadItems.splice(i, 1);
                            break;
                        case 'resume':
                            if (item.canResume()) {
                                item.resume();
                            }
                            break;
                    }
                }
            }
        }
    });

    /**接收渲染进程 获取某个下载文件的下载存放路径 的通知 返回下载存放路径
     * @param {String} fingerPrint 文件指纹
     */
    ipcMain.handle('get-download-file-savepath', function(event, fingerPrint) {
        let state = null;
        for (let i = 0; i < downloadItems.length; i++) {
            if (downloadItems[i].fingerPrint === fingerPrint) {
                const item = downloadItems[i].item;
                return item.getSavePath();
            }
        }
        return state;
    });

    /**接收渲染进程 打开指定路径的本地文件 的通知 并返回结果（路径存在能打开就返回true，路径不存在无法打开就返回false）
     * @param {Object} event
     * @param {String} path
     */
    ipcMain.handle('open-dir', function(event, path, isOpenFile) {
        if (!path) return false;
        if (isOpenFile) {
            shell.openPath(path);//打开文件
            return true;
        } else {
            const checkPath = fs.existsSync(path);//以同步的方法检测文件路径是否存在。
            if (checkPath) {//文件存在直接打开所在目录
                shell.showItemInFolder(path);
                return true;
            } else {
                return false;
            }
        }

    });

    /**
     * 接收渲染进程 判断文件路径是否存在 的通知 返回是否存在的布尔值结果
     */
    ipcMain.handle('fs-exists', function(event, path) {
        if (!path) return false;
        const checkPath = fs.existsSync(path);//以同步的方法检测文件路径是否存在。
        return checkPath;
    });
}

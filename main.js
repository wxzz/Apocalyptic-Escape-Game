const { app, BrowserWindow } = require('electron');

function createWindow() {
    // 创建一个浏览器窗口
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        show: false,
        webPreferences: {
            nodeIntegration: true, // 允许在渲染进程中使用Node.js API
            webSecurity: false // 禁用web安全策略，允许跨域请求
        }
    });

    // 加载你的 index.html 文件
    win.loadFile('index.html');

     win.once('ready-to-show', () => {
        win.maximize();      // 强制最大化（铺满屏幕，保留任务栏）
        win.show();          // 再显示窗口
    });

    // 打开开发者工具（调试时可以取消注释）
    // win.webContents.openDevTools();
}

// 当 Electron 完成初始化并准备创建浏览器窗口时，调用此方法
app.whenReady().then(createWindow);

// 所有窗口关闭时退出应用 (macOS 除外)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
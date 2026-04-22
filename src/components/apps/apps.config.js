// 应用配置文件
// 统一管理所有应用的元数据和配置

// 导入应用组件
import HomeApp from './HomeApp.vue'
import FileManagerApp from './FileManagerApp.vue'
import TerminalApp from './TerminalApp.vue'
import CalculatorApp from './CalculatorApp.vue'
import NotesApp from './NotesApp.vue'
import BrowserApp from './BrowserApp.vue'
import SettingsApp from './SettingsApp.vue'
import CameraApp from './CameraApp.vue'
import MusicApp from './MusicApp.vue'
import InspirationApp from './InspirationApp.vue'

// 应用列表配置
export const apps = [
  {
    packageId: 'com.brainplus.home',
    name: '首页',
    icon: 'https://cdn-icons-png.flaticon.com/512/1946/1946488.png',
    view: HomeApp,
    defaultWidth: 800,
    defaultHeight: 600,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.inspiration',
    name: '灵感捕获',
    icon: 'https://cdn-icons-png.flaticon.com/512/869/869045.png',
    view: InspirationApp,
    defaultWidth: 420,
    defaultHeight: 700,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.files',
    name: '文件管理器',
    icon: 'https://cdn-icons-png.flaticon.com/512/3767/3767084.png',
    view: FileManagerApp,
    defaultWidth: 900,
    defaultHeight: 650,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.terminal',
    name: '终端',
    icon: 'https://cdn-icons-png.flaticon.com/512/2942/2942924.png',
    view: TerminalApp,
    defaultWidth: 800,
    defaultHeight: 500,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.calculator',
    name: '计算器',
    icon: 'https://cdn-icons-png.flaticon.com/512/2373/2373383.png',
    view: CalculatorApp,
    defaultWidth: 320,
    defaultHeight: 500,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.notes',
    name: '记事本',
    icon: 'https://cdn-icons-png.flaticon.com/512/2965/2965335.png',
    view: NotesApp,
    defaultWidth: 900,
    defaultHeight: 600,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.browser',
    name: '浏览器',
    icon: 'https://cdn-icons-png.flaticon.com/512/3116/3116491.png',
    view: BrowserApp,
    defaultMax: true,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.settings',
    name: '设置',
    icon: 'https://cdn-icons-png.flaticon.com/512/2040/2040504.png',
    view: SettingsApp,
    defaultWidth: 1000,
    defaultHeight: 700,
    hiddenInDesktop: false
  },
  {
    packageId: 'com.brainplus.camera',
    name: '相机',
    icon: 'https://cdn-icons-png.flaticon.com/512/3617/3617084.png',
    view: CameraApp,
    defaultWidth: 400,
    defaultHeight: 600,
    hiddenInDesktop: true
  },
  {
    packageId: 'com.brainplus.music',
    name: '音乐',
    icon: 'https://cdn-icons-png.flaticon.com/512/3075/3075908.png',
    view: MusicApp,
    defaultWidth: 400,
    defaultHeight: 600,
    hiddenInDesktop: true
  }
]

// 导出应用组件（方便按需使用）
export {
  HomeApp,
  FileManagerApp,
  TerminalApp,
  CalculatorApp,
  NotesApp,
  BrowserApp,
  SettingsApp,
  CameraApp,
  MusicApp,
  InspirationApp
}

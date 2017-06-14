const {app, BrowserWindow} = require('electron')
const path = require('path')
const ipc = require('electron').ipcMain

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 600, height: 500})

  // and load the index.html of the app.
  mainWindow.loadURL(path.join('file://', __dirname, 'index.html'))

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const Request = require('request')
const cheerio = require('cheerio')

const cookies = Request.jar()
const request = Request.defaults({
  jar: cookies,
  followAllRedirects: true
})

let credentials
const moodleURL = 'https://moodle.hochschule-rhein-waal.de/login/index.php'

function getCourses (event) {
  // Starte Zeit für das holen der Kursliste
  console.time('get-courses')

  request.post(moodleURL, {form: credentials},
    (err, res, body) => {
      if (err) { throw err }

      // console.log('COOKIE', res.headers['set-cookie'])
      console.log('JAR', cookies)
      // console.log('BODY:', body)

      let courses = []

      const $ = cheerio.load(body)
      const courseLinks = $('.type_course a')
      console.log('COURSELINKS:', courseLinks)
      courseLinks.each(
        (i, a) => {
          const href = $(a).attr('href')
          const course = {
            course: $(a).attr('title'),
            url: href.replace('/view.php?', '/resources.php?'),
            id: href.match(/id=([0-9]+)/)[1]
          }
          courses.push(course)
          console.log(`COURSE ${i}:`, course)
        }
      )
      // Stoppe Zeit für das holen der Kursliste
      console.timeEnd('get-courses')

      console.log('COURSES:', courses)
      event.sender.send('received-courses', courses)
    }
  )
}

ipc.on('save-credentials', (event, _credentials) => {
  if (_credentials.username === '' || _credentials.password === '') {
    console.warn('CREDENTIALS INVALID:', _credentials)
  } else {
    credentials = _credentials
    console.info('CREDENTIALS SET:', credentials)
  }
})

ipc.on('get-courses', function (event) {
  getCourses(event)
})

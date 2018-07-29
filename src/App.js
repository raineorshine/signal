import React, { Component } from 'react'
import './App.css'
import moment from 'moment'
import * as throttle from 'lodash.throttle'
import ClickNHold from 'react-click-n-hold'
import * as pkg from '../package.json'
import tutorialImg from './tutorial.png'
import { createStore } from 'redux'
import { Provider, connect } from 'react-redux'

/**************************************************************
 * Setup
 **************************************************************/

const firebaseConfig = {
  apiKey: "AIzaSyA58BMqwEAw12sgI4guZbsDdVZ7yoXwDqI",
  authDomain: "zonesofprep.firebaseapp.com",
  databaseURL: "https://zonesofprep.firebaseio.com",
  projectId: "zonesofprep",
  storageBucket: "zonesofprep.appspot.com",
  messagingSenderId: "918887966885"
}

export const [STATE_RED, STATE_YELLOW, STATE_GREEN, STATE_NULL] = [-1,0,1,2]

// raineorshine@gmail.com test data: https://console.firebase.google.com/u/0/project/zonesofprep/database/zonesofprep/data/users/T9FGz1flWIf1sQU5B5Qf3q6d6Oy1
const defaultRows = JSON.stringify([{
  checkins: {},
  label: '💤'
}, {
  checkins: {},
  label: '🥗'
}, {
  checkins: {},
  label: '👟'
}])

// firebase init
const firebase = window.firebase
if (firebase) {
  firebase.initializeApp(firebaseConfig)
  window.__DEBUG = {}
  window.__DEBUG.signout = firebase.auth().signOut.bind(firebase.auth())
}

const localGet = key => {
  const value = localStorage[localStorage.latestUid + '.' + key]
  return value === undefined || key === 'startDate' ? value : JSON.parse(value)
}
const localGetTemp = key => {
  const value = localStorage['temp.' + key]
  return value === undefined || key === 'startDate' ? value : JSON.parse(value)
}
const localSet = (key, value) => localStorage[localStorage.latestUid + '.' + key] = value

// init localStorage
if (!localStorage.latestUid) {
  localStorage.latestUid = 'temp'
}

if (!localGet('rows')) {
  localSet('rows', defaultRows)
}

if (!localGet('showFadedToday')) {
  localSet('showFadedToday', 'true')
}

if (!localGet('decayDays')) {
  localSet('decayDays', JSON.stringify([true, true, true, true, true, true, true]))
}

// manually add/remove class to body since it's outside the target element of render
document.body.classList[localGet('night') ? 'add' : 'remove']('night')

/**************************************************************
 * Store & Reducer
 **************************************************************/

const migrate1to2 = oldState => {

  console.info('Migrating schema v1 to v2')
  console.info('oldState', oldState)

  const newState = {
    settings: {
      showCheckins: oldState.showCheckins,
      showFadedToday: oldState.showFadedToday,
      decayDays: oldState.decayDays,
      night: oldState.night
    },
    rows: oldState.zones.map(z => ({
      decay: z.decay || 0,
      label: z.label,
      checkins: Object.keys(z.checkins)
        .map((value, i) => {
          // create a new 0-based, right-aligned index
          // subtract 1 because the index for manualCheckins is 1-based instead of 0-based
          const days = z.checkins.length - i - 1
          const date = moment(oldState.startDate).add(days, 'days').format('YYYY-MM-DD')
          return Object.assign(z.manualCheckins && z.manualCheckins[days + 1] ? {
            date,
            state: z.checkins[i]
          } : {}, z.notes && z.notes[days] ? {
            note: z.notes[days]
          } : {})
        })
        // convert back to object
        // filter out empty checkins
        .reduce((prev, next, i) => {
          return Object.keys(next).length ? Object.assign({}, prev, {
            [next.date]: next
          }) : prev
        }, {})
    }))
  }

  console.info('newState', newState)

  // these also must be synced with firebase in the value handler
  localSet('rows', JSON.stringify(newState.rows))
  localSet('settings', JSON.stringify(newState.settings))
  localSet('schemaVersion', 2)

  return newState
}

const startDate = localGet('startDate') || moment().subtract(6, 'days').toISOString()
const initialState = Object.assign({
  startDate,
  scrollY: window.scrollY,
  windowHeight: window.innerHeight,
}, localGet('schemaVersion') === 2 ? {
  rows: localGet('rows'),
  settings: localGet('settings'),
  schemaVersion: localGet('schemasVersion')
} : migrate1to2({
  decayDays: localGet('decayDays'),
  night: localGet('night'),
  showCheckins: localGet('showCheckins'),
  showFadedToday: localGet('showFadedToday'),
  startDate,
  // start the tutorial if the user has not checked in yet
  tutorial: !localGet('lastUpdated'),
  zones: localGet('zones') || JSON.parse(defaultRows)
}))

const appReducer = (state = initialState, action) => {
  console.log('DISPATCH', action)
  switch(action.type) {
    case 'DISABLE_CLICK':
      return Object.assign({}, state, { disableClick: action.value })
    case 'FIREBASE_CONNECTED':
      const { offline, userRef, user } = action
      return Object.assign({}, state, { offline, userRef, user })
    case 'OFFLINE':
      return Object.assign({}, state, { offline: action.value })
    case 'SYNC':
      sync(action.key, action.value, action.local)
      return state
    case 'SCROLL':
      return Object.assign({}, state, { scrollY: action.scrollY })
    case 'RESIZE':
      return Object.assign({}, state, { innerHeight: action.innerHeight })
    case 'ESCAPE':
      return Object.assign({}, state, {
        noteEdit: null,
        noteEditReady: false,
        tutorial: false
      })
    case 'TOGGLE_SETTINGS':
      return Object.assign({}, state, { showSettings: !state.showSettings })
    case 'TOUCH':
      return Object.assign({}, state, { touch: true })
    case 'TUTORIAL':
      return Object.assign({}, state, {
        tutorial: action.value,
        showSettings: state.showSettings && !action.value
      })
    default:
      return state
  }
}

const store = createStore(appReducer)

// check if user is logged in
if (firebase) {
  firebase.auth().onAuthStateChanged(user => {

    // if not logged in, redirect to OAuth login
    if (!user) {
      const provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithRedirect(provider)
      return
    }

    // disable offline mode
    window.clearTimeout(offlineTimer)

    // if logged in, save the user ref and uid into state
    const userRef = firebase.database().ref('users/' + user.uid)
    store.dispatch({
      type: 'FIREBASE_CONNECTED',
      offline: false,
      userRef,
      user
    })

    // delay presence detection to avoid initial disconnected state
    setTimeout(() => {
      const connectedRef = firebase.database().ref(".info/connected")
      connectedRef.on('value', snap => {
        const connected = snap.val()

        // update offline state
        store.dispatch({ type: 'OFFLINE', value: !connected })

        // when reconnecting, if there are missing days, fill them in, but do not update Firebase
        if (connected) {
          const missingDays = moment().diff(localGet('startDate'), 'days') - store.getState().rows[0].checkins.length + 1
          if (missingDays > 0) {
            store.dispatch({ type: 'SYNC', key: 'rows', value: store.getState().rows, local: true })
          }
        }
      })
    }, 1000)

    // set latest uid so that offline data is loaded from last user
    // do NOT use localSet (because latestUid is not namespaced by itself)
    // if this is the first login for the user, copy over from temp
    localStorage.latestUid = user.uid
    if (!localGet('rows')) {
      localSet('rows', localGetTemp('rows'))
      localSet('settings', localGetTemp('settings'))
    }

    // load Firebase data
    userRef.on('value', snapshot => {
      const value = snapshot.val()
      const state = store.getState()

      if (value) {

        // update user information
        userRef.update({
          name: user.displayName,
          email: user.email
        })


        // settings
        if (value.settings) {
          if (value.settings.decayDays) {
            store.dispatch({ type: 'SYNC', key: 'decayDays', value: value.settings.decayDays, local: true })
          }

          if (value.settings.night) {
            store.dispatch({ type: 'SYNC', key: 'night', value: value.settings.night, local: true })
          }

          if (value.settings.showCheckins) {
            store.dispatch({ type: 'SYNC', key: 'showCheckins', value: value.settings.showCheckins, local: true })
          }

          if (value.settings.showFadedToday) {
            store.dispatch({ type: 'SYNC', key: 'showFadedToday', value: value.settings.showFadedToday, local: true })
          }
        }

        // save start date or legacy start date
        const startDate = value.startDate || '2018-03-24T06:00:00.000Z'
        store.dispatch({ type: 'SYNC', key: 'startDate', value: startDate, local: true })

        // if Firebase data is newer than stored data, update localStorage
        if (value.rows && value.lastUpdated > (localGet('lastUpdated') || 0)) {
          store.dispatch({ type: 'SYNC', key: 'rows', value: value.rows, local: true })
        }

        // schema v1 to v2: init
        if (!value.schemaVersion) {
          console.info('migrating firebase zones')
          store.dispatch({ type: 'SYNC', key: 'zones', value: value.zones, local: true })

          store.dispatch({ type: 'SYNC', key: 'rows', value: state.rows, local: false })
          store.dispatch({ type: 'SYNC', key: 'settings', value: state.settings, local: false })
          store.dispatch({ type: 'SYNC', key: 'schemaVersion', value: 2, local: false })
        }

        // old data should be deleted manually as there is no easy way to delete an entire collection
        // https://firebase.google.com/docs/firestore/manage-data/delete-data

        // do nothing if Firebase data is older than stored data
      }
      // if no Firebase data, initialize with defaults
      else {
        store.dispatch({ type: 'SYNC', key: 'rows', value: null, local: true })
      }
    })
  })
}

// save to state, localStorage, and Firebase
const sync = (key, value, localOnly) => {

  const state = store.getState()

  if (key === 'rows' && !value) {
    throw new Error('Attempt to delete rows')
  }

  store.dispatch({ type: 'SET', key, value }, () => {

    // update localStorage
    localSet(key, key === 'startDate' ? value : JSON.stringify(value))

    // update Firebase
    if (!localOnly) {

      // if syncing rows, update lastUpdated in localStorage
      if (key === 'rows') {
        localSet('lastUpdated', Date.now())
      }

      state.userRef.update(
        // if syncing rows, set the start date and lastUpdated
        key === 'rows' ? {
          rows: value,
          startDate: state.startDate,
          lastUpdated: Date.now()
        }
        // otherwise just set the value
        : { [key]: value }
      )
    }
  })
}

/**************************************************************
 * Window Events
 **************************************************************/

// Set to offline mode in 5 seconds. Cancelled with successful login.
const offlineTimer = window.setTimeout(() => {
  store.dispatch({ type: 'SYNC', key: 'offline', local: true })
}, 5000)

// update scroll for fixing position:fixed controls
window.addEventListener('scroll', () => {
  store.dispatch({ type: 'SCROLL', scrollY: window.scrollY })
})

// update scroll for fixing position:fixed controls
window.addEventListener('resize', () => {
  // NOTE: window.innerHeight doesn't update properly in the Chrome mobile simulator when switching orientation
  store.dispatch({ type: 'RESIZE', windowHeight: window.innerHeight })
})

// keyboard shortcuts
window.addEventListener('keydown', e => {
  // close all popups if the escape key OR Cmd+Enter OR Control+Enter is hit
  if (e.keyCode === 27 || (e.keyCode === 13 && e.metaKey)) {
    store.dispatch({ type: 'ESCAPE' })
  }
})

window.addEventListener('mousemove', () => {
  if (!store.getState().disableClick) {
    store.dispatch({ type: 'DISABLE_CLICK', value: true })
  }
})

/**************************************************************
 * Helper functions
 **************************************************************/

const promoteWithNull = c => (c + 2) % 4 - 1
// const demoteWithNull = c => (c + 4) % 4 - 1
const promote = c => (c + 2) % 3 - 1
const demote = c => (c - 2) % 3 + 1
// const promoteNoWrap = c => c < 1 ? c + 1 : 1
// const demoteNoWrap = c => c > -1 ? c - 1 : -1

/** Returns true if all checkins in the list are the same. */
const same = list => {
  if (list.length <= 1) return true;

  const start = list[0]
  for(let i=1; i<list.length; i++) {
    if (list[i].state !== start.state) return false
  }

  return true
}

// check if the decay rate has been met
// e.g. a row with a decay rate of 3 will only decay after 3 days in a row without a checkin
export const readyToDecay = (prevCheckins, decay) => {

  // cannot decay past red
  if (prevCheckins[0].state === STATE_RED || prevCheckins[0].state === STATE_NULL) return false

  const checkinsInDecayRange = prevCheckins.slice(0, decay - 1)
  return checkinsInDecayRange.every(c => !c.checkin) &&
    same(checkinsInDecayRange)
}

/** Return a new checkin for a given row with potential decay */
export const checkinWithDecay = (prevCheckins, decay, decayDaysOfWeek) => {

  return decay && // row has a decay
    decayDaysOfWeek[moment(prevCheckins[0].date).day()] && // can decay on this day of the week
    readyToDecay(prevCheckins, decay) // do last for efficiency
      ? demote(prevCheckins[0].state)
      : prevCheckins[0].state
}

// endDate defaults to now
export const expandRows = (rows, startDate, decayDays, endDate) => {
  const totalDays = moment(endDate).diff(startDate, 'days') + 1
  return rows ? rows.map(row => ({
    label: row.label,
    decay: row.decay,
    checkins: row.checkins ? [...Array(totalDays).keys()].reduce((prevCheckins, days) => {
      const date = moment(startDate).add(days, 'days').format('YYYY-MM-DD')

      // ignore dates before the first checkin
      return prevCheckins.length === 0 && !row.checkins[date] ? prevCheckins : [
          Object.assign(
            // date, state
            {
              date,
              state: row.checkins[date] ? row.checkins[date].state : checkinWithDecay(prevCheckins, row.decay, decayDays)
            },
            // note
            row.checkins[date] && row.checkins[date].note ? { note: row.checkins[date].note } : {},
            // checkin
            row.checkins[date] && ('state' in row.checkins[date]) ? { checkin: true } : {},
          )].concat(prevCheckins)
      }, []) : []
  })) : []
}

/**************************************************************
 * App
 **************************************************************/

class AppComponentOld extends Component {

  constructor() {
    super()

    // load data immediately from localStorage
    const startDate = localGet('startDate') || moment().subtract(6, 'days').toISOString()
    this.state = Object.assign({
      startDate,
      scrollY: window.scrollY,
      windowHeight: window.innerHeight,
    }, localGet('schemaVersion') === 2 ? {
      rows: localGet('rows'),
      settings: localGet('settings'),
      schemaVersion: localGet('schemasVersion')
    } : migrate1to2({
      decayDays: localGet('decayDays'),
      night: localGet('night'),
      showCheckins: localGet('showCheckins'),
      showFadedToday: localGet('showFadedToday'),
      startDate: startDate,
      // start the tutorial if the user has not checked in yet
      tutorial: !localGet('lastUpdated'),
      zones: localGet('zones') || defaultRows
    }))

    this.render = this.render.bind(this)
    this.addRow = this.addRow.bind(this)
    this.editNote = this.editNote.bind(this)
    this.editNoteThrottled = throttle(this.editNote, 1000, { leading: false })
  }

  /**************************************************************
   * State Change
   **************************************************************/

  // toggle the state of a checkin
  changeState(prevCheckins, decay, c, i) {
    // console.log('changeState', prevCheckins, decay, this.state.settings.decayDays)

    // get conditions and values for determining a decayed checkin
    const decayedCheckin = checkinWithDecay(prevCheckins, decay, this.state.settings.decayDays)

    const checkinsInDecayRange = prevCheckins.slice(0, decay - 1)
    const value = checkinsInDecayRange.every(c => !c.checkin) && same(checkinsInDecayRange)

    const prevCheckinNull = !prevCheckins[0] || prevCheckins[0].checkin === STATE_NULL
    const showFaded = (this.state.settings.showFadedToday && i === 0) || this.state.settings.showCheckins

    // rotate through decayed checkin
    // (normally, add rotation (green ? before : after) decayed checkin matches next checkin
    const useDecayedCheckin = showFaded &&
      prevCheckins[0].checkin &&
      !prevCheckinNull &&
      (decayedCheckin === STATE_GREEN ? prevCheckins[0] === STATE_YELLOW : prevCheckins[0] === decayedCheckin)

    // set new checkin and manual checkin
    prevCheckins[0].state = useDecayedCheckin ? decayedCheckin :
      prevCheckinNull ? promoteWithNull(prevCheckins[0]) :
      /* modified rotation for decayed green*/(prevCheckins[0] === STATE_GREEN && !prevCheckins[0].checkin ? STATE_GREEN :
      promote(prevCheckins[0]))

    prevCheckins[0].checkin = !useDecayedCheckin

    // update local immediately
    this.sync('rows', this.state.rows, true)

    // // update subsequent decayed check-ins (with animation)
    // let di = ci-1 // stop any animation in progress
    // clearInterval(this.dominoInterval)
    // this.dominoInterval = setInterval(() => {

    //   // only update decayed check-ins coming after the current item
    //   if (di >= 0 && !z.manualCheckins[z.checkins.length - di]) {

    //     // update rows
    //     z.checkins.splice(di, 1, checkinWithDecay(z, di+1))

    //     // advance animation
    //     di--

    //     // update local during animation
    //     this.sync('rows', this.state.rows, true)
    //   }
    //   else {
    //     // end animation
    //     clearInterval(this.dominoInterval)

    //     // update Firebase at end of animation
    //     // (also applies if there were no subsequent decayed checkins)
    //     this.sync('rows', this.state.rows)
    //   }

    // }, 60)
  }

  addRow() {
    const label = prompt('Enter an emoji for your new habit:')
    if (!label) return

    const decay = +prompt('Enter a decay rate. You may enter a value greater than 0 to have the new day\'s checkin decrease if that many days has passed without change. For example, a habit with a decay rate of 3 will automatically decrease after 3 identical checkins in a row.', 0)

    const sampleCheckins = this.state.rows[0].checkins || []
    const rows = this.state.rows.concat([
      {
        label,
        decay,
        checkins: sampleCheckins.concat().fill(STATE_NULL)
      }
    ])
    this.sync('rows', rows)
  }

  editRow(z) {
    const label = prompt(`Enter a new emoji for ${z.label}:`, z.label)
    if (!label) return

    const decay = +prompt('Enter a decay rate. You may enter a value greater than 0 to have the new day\'s checkin decrease if that many days has passed without change. For example, a habit with a decay rate of 3 will automatically decrease after 3 identical checkins in a row.', z.decay)

    z.label = label
    z.decay = decay
    this.sync('rows', this.state.rows)
  }

  moveRowDown(z) {
    const rows = this.state.rows.concat()
    const zi = rows.indexOf(z)
    rows.splice(zi, 1)
    rows.splice(zi+1, 0, z)
    this.sync('rows', rows)
  }

  moveRowUp(z) {
    const rows = this.state.rows.concat()
    const zi = rows.indexOf(z)
    rows.splice(zi, 1)
    rows.splice(zi-1, 0, z)
    this.sync('rows', rows)
  }

  removeRow(z) {
    if (window.confirm(`Are you sure you want to delete ${z.label}?`)) {
      const rows = this.state.rows.concat()
      rows.splice(rows.indexOf(z), 1)
      this.sync('rows', rows)
    }
  }

  removeColumn() {
    const rows = this.state.rows.map(z => {
      z.checkins.shift()
      return z
    })
    this.sync('rows', rows)
  }

  editNote(zi, ci, text) {
    // NOTE: do not pass z directly as the object reference will change asynchronously when state is updated
    // causing obsolete text to be saved to the server at a certain point without any discrepancies visible client-side until the note was closed and re-opened.
    const z = this.state.rows[zi]
    z.notes = z.notes || {}
    if (text) {
      z.notes[z.checkins.length - ci - 1] = text
    }
    else {
      delete z.notes[z.checkins.length - ci - 1]
    }
    this.sync('rows', this.state.rows)
  }
 }

const AppComponent = connect()(() => {

  const state = store.getState()

  // used to vertically center the content
  const contentHeight = state.rows.length * 50
  const marginTop = Math.max(0, (window.innerHeight - contentHeight)/2 - 65)

  // expand checkins from right to left
  const expandedRows = expandRows(state.rows, state.startDate, state.settings.decayDays)

  return <div
    className={'app' + (state.showSettings ? ' settings-active' : '')}
    // keep track of touch devices so that we can disable duplicate touch/mousedown events
    onTouchStart={() => state.dispatch({ type: 'TOUCH' })}
  >

    { // tutorial
      state.tutorial ? <div className='popup-container tutorial-container' onClick={() => state.dispatch({ type: 'TUTORIAL', value: false })}>
        <div className='popup tutorial-popup'>
          <img className='tutorial-image' alt='screenshot1' src={tutorialImg}/>
          <p className='tutorial-text'>
            Keep track of habits! <span className='tutorial-colored-text tutorial-red'>Red</span>, <span className='tutorial-colored-text tutorial-yellow'>yellow</span>, <span className='tutorial-colored-text tutorial-green'>green</span>—you choose what each one means!<br/>
            <a className='button tutorial-button'>Let's Go!</a>
          </p>
        </div>
      </div> : null}

    { // notes
      state.noteEdit ? <div className='popup-container note-container'>
      <div className='popup note-popup'>
        <p className='note-label'>{state.noteEdit.z.label}</p>
        <p className='note-date'>{moment(state.startDate).add(state.noteEdit.z.checkins.length - state.noteEdit.ci - 1, 'days').format('dddd, MMMM Do')}</p>
        <textarea className='note-text' onInput={(e) => this.editNote(state.noteEdit.zi, state.noteEdit.ci, e.target.value)} defaultValue={state.noteEdit.z.notes && state.noteEdit.z.notes[state.noteEdit.z.checkins.length - state.noteEdit.ci - 1]}></textarea>
        <a className='button note-button' onClick={state.noteEditReady ? () => state.dispatch({ type: 'ESCAPE' }) : null}>Close</a>
      </div>
    </div> : null}

    { // main content
      // do not render in background of notes on mobile; causes feint gridlines to appear when note closes
      !state.tutorial && !(state.touch && state.noteEdit) ? <div>
        <div className='status'>
          {state.offline ? <span className='status-offline'>Working Offline</span> :
          !state.user ? <span className='status-loading'>Signing in...</span>
          : null}
        </div>
        <div className='top-options'>
          {state.showSettings ? <span className='settings-content'>
            Decay (Mon-Sun): <span className='nowrap'>{[1, 2, 3, 4, 5, 6, 0].map(day =>
              <input key={day} type='checkbox' checked={state.settings.decayDays[day]} onChange={() => {
                state.settings.decayDays.splice(day, 1, !state.settings.decayDays[day])
                return this.sync('decayDays', state.settings.decayDays)}
              }/>
            )}</span><br/>
            Show today's checkins: <input type='checkbox' disabled={state.settings.showCheckins} checked={state.settings.showFadedToday} onChange={() => this.sync('showFadedToday', !state.settings.showFadedToday)} /><br/>
            Show all checkins: <input type='checkbox' checked={state.settings.showCheckins} onChange={() => this.sync('showCheckins', !state.settings.showCheckins)} /><br/>
            Night Mode 🌙: <input type='checkbox' checked={state.settings.night} onChange={() => {
              document.body.classList[!state.settings.night ? 'add' : 'remove']('night')
              this.sync('night', !state.settings.night, true)
            }} /><br />
            <a className='settings-showintro text-small' onClick={() => state.dispatch({ type: 'TUTORIAL', value: true })}>Show Intro</a><br/>
            <a className='settings-logout text-small' onClick={() => firebase.auth().signOut()}>Log Out</a><br/>
            <hr/>
            <div className='text-small'>
            {state.user ? <span>
              <span className='dim'>Logged in as: </span>{state.user.email}<br/>
              <span className='dim'>User ID: </span><span className='mono'>{state.user.uid}</span><br/>
            </span> : null}
            <span className='dim'>Version: </span>{pkg.version}
            </div>
          </span> : null}
          <span role='img' aria-label='settings' className={'settings-option' + (state.showSettings ? ' active' : '')} onClick={() => /*TODO*/state.dispatch({ type: 'TOGGLE_SETTINGS' })}>⚙️</span>
        </div>

        <div className='gradient'></div>
        <div className='desktop-mask'></div>
        <div className='content' style={{ marginTop }}>
          {expandedRows ? <div>
              <Dates checkins={state.rows[0].checkins}/>
              <div className='rows'>
                {expandedRows.map((row, i) =>
                  <Row key={row.label} disableClick={state.disableClick} settings={state.settings} totalRows={state.rows.length} touch={state.touch} row={row} i={i} windowHeight={state.windowHeight} scrollY={state.scrollY} />
                )}
                { // move col-options to settings if enough habits and two weeks of checkins
                  state.showSettings || expandedRows.length < 5 || expandedRows[0].checkins.length <= 14 ? <div className='left-controls col-options' style={{ top: marginTop + 65 + expandedRows.length * 50 - state.scrollY }}>
                  <span className='box'>
                    <span className='box option col-option' onClick={this.addRow}>+</span>
                  </span>
                </div> : null}
              </div>
            </div>
            : <p className='loading'>Loading data...</p>
          }
        </div>
      </div> : null
    }
  </div>
})

const Row = connect()(({ disableClick, settings, scrollY, totalRows, touch, windowHeight, row, i, dispatch }) => {
  const contentHeight = totalRows * 50
  const marginTop = Math.max(65, (windowHeight - contentHeight)/2)
  const top = marginTop + i*50 - scrollY
  return <div className='row'>
    <span className='left-controls' style={{ top }}>
      <span className='row-options'>
        { i > 0
          ? <span className='box option option-row' onClick={() => dispatch({ type: 'MOVE_ROW_UP', value: row })}>↑</span>
          : <span className='box option option-row option-hidden'></span>
        }
        { i < totalRows - 1
          ? <span className='box option option-row' onClick={() => dispatch({ type: 'MOVE_ROW_DOWN', value: row })}>↓</span>
          : <span className='box option option-row option-hidden'></span>
        }
        <span className='box option option-row' onClick={() => dispatch({ type: 'REMOVE_ROW', value: row })}>-</span>
      </span>
      <span className='box row-label' onClick={() => dispatch({ type: 'EDIT_ROW', value: row })}>{row.label}</span>
    </span>
    <span className='checkins'>{row.checkins ? row.checkins.map((c, i) => {
      return <Checkin key={i} row={row} c={c} i={i} disableClick={disableClick} settings={settings} touch={touch} />
    }) : null}</span>
  </div>
})

const Checkin = connect()(({ row, c, i, disableClick, settings, touch, dispatch }) =>
  <ClickNHold
    className='clicknhold'
    time={0.5}
    onStart={(e) => {
      dispatch({ type: 'DISABLE_CLICK', value: false })
    }}
    onClickNHold={() => {
      if (!disableClick) {
        dispatch({ type: 'NOTE_EDIT', value: { } })

        // delayed actions
        window.setTimeout(() => {
          // focus on text box
          const noteText = document.querySelector('.note-text')
          if (noteText) {
            noteText.focus()
          }

          // enable close button
          // if this is not delayed, then overlapping touch events on the bottom rows cause the notes to accidentally close immediately after opening
          dispatch({ type: 'NOTE_EDIT_READY', value: true })
        }, 350)
      }
    }}
    onEnd={(e, enough) => {
      // normal click event
      // treat mouse event as duplicate and ignore if on a touchscreen
      if (!disableClick && !enough && !(touch && e.type === 'mouseup')) {
        const prevCheckins = row.checkins.slice(i, i + row.decay + 1)
        this.changeState(prevCheckins, row.decay, c, i)
      }

      // must be disabled to avoid duplicate onMouseDown/onTouchStart that the ClickNHold component uses
      dispatch({ type: 'DISABLE_CLICK', value: true })
    }}
  ><span onTouchMove={() => dispatch({ type: 'DISABLE_CLICK', value: true })} className={'box checkin checkin' + c.state + (
    // today
    ((settings.showFadedToday && i === 0) || settings.showCheckins) && !c.checkin ? ' faded' : '')}>
    {c.note ? <span className='note-marker'></span> : null}
  </span></ClickNHold>
)

const Dates = connect()(({ checkins, dispatch }) =>
  <div className='dates'>
    <div className='box dates-mask'></div>
    {Object.keys(checkins || {}).map(date => {
      return <span key={date} className='box date' title={moment(date).format('dddd, M/D')}>{moment(date).format('D')}</span>
    })}
  </div>
)

const App = () => <Provider store={store}>
  <AppComponent/>
</Provider>

export default App

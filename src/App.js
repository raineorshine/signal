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

const initialState = {}

const appReducer = (state = initialState, action) => {
  switch(action.type) {
    case 'CHANGE_STATE':
      return null
    default:
      return state
  }
}

const store = createStore(appReducer)

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

/**************************************************************
 * App
 **************************************************************/

class AppComponent extends Component {

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

    // Set to offline mode in 5 seconds. Cancelled with successful login.
    const offlineTimer = window.setTimeout(() => {
      this.setState({ offline: true })
    }, 5000)

    // update scroll for fixing position:fixed controls
    window.addEventListener('scroll', () => {
      this.setState({ scrollY: window.scrollY })
    })

    // update scroll for fixing position:fixed controls
    window.addEventListener('resize', () => {
      // NOTE: window.innerHeight doesn't update properly in the Chrome mobile simulator when switching orientation
      this.setState({ windowHeight: window.innerHeight })
    })

    // keyboard shortcuts
    window.addEventListener('keydown', e => {
      // close all popups if the escape key OR Cmd+Enter OR Control+Enter is hit
      if (e.keyCode === 27 || (e.keyCode === 13 && e.metaKey)) {
        this.setState({
          noteEdit: null,
          noteEditReady: false,
          tutorial: false
        })
      }
    })

    window.addEventListener('mousemove', () => {
      if (!this.state.disableClick) {
        this.setState({ disableClick: true })
      }
    })

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
        this.setState({
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
            this.setState({ offline: !connected })

            // when reconnecting, if there are missing days, fill them in, but do not update Firebase
            if (connected) {
              const missingDays = moment().diff(localGet('startDate'), 'days') - this.state.rows[0].checkins.length + 1
              if (missingDays > 0) {
                this.sync('rows', this.state.rows, true)
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

          if (value) {

            // update user information
            userRef.update({
              name: user.displayName,
              email: user.email
            })


            // settings
            if (value.settings) {
              if (value.settings.decayDays) {
                this.sync('decayDays', value.settings.decayDays, true)
              }

              if (value.settings.night) {
                this.sync('night', value.settings.night, true)
              }

              if (value.settings.showCheckins) {
                this.sync('showCheckins', value.settings.showCheckins, true)
              }

              if (value.settings.showFadedToday) {
                this.sync('showFadedToday', value.settings.showFadedToday, true)
              }
            }

            // save start date or legacy start date
            const startDate = value.startDate || '2018-03-24T06:00:00.000Z'
            this.sync('startDate', startDate, true)

            // if Firebase data is newer than stored data, update localStorage
            if (value.rows && value.lastUpdated > (localGet('lastUpdated') || 0)) {
              this.sync('rows', value.rows, true)
            }

            // schema v1 to v2: init
            if (!value.schemaVersion) {
              console.info('migrating firebase zones')
              this.sync('zones', value.zones, true)

              this.sync('rows', this.state.rows, false)
              this.sync('settings', this.state.settings, false)
              this.sync('schemaVersion', 2, false)
            }

            // old data should be deleted manually as there is no easy way to delete an entire collection
            // https://firebase.google.com/docs/firestore/manage-data/delete-data

            // do nothing if Firebase data is older than stored data
          }
          // if no Firebase data, initialize with defaults
          else {
            this.sync('rows', null, true)
          }
        })
      })
    }

    this.toggleSettings = this.toggleSettings.bind(this)
    this.sync = this.sync.bind(this)
    this.row = this.row.bind(this)
    this.checkin = this.checkin.bind(this)
    this.render = this.render.bind(this)
    this.addRow = this.addRow.bind(this)
    this.editNote = this.editNote.bind(this)
    this.editNoteThrottled = throttle(this.editNote, 1000, { leading: false })
  }

  /**************************************************************
   * State Change
   **************************************************************/

  // state only
  toggleSettings() {
    this.setState({ showSettings: !this.state.showSettings })
  }

  // save to state, localStorage, and Firebase
  sync(key, value, localOnly) {

    if (key === 'rows' && !value) {
      throw new Error('Attempt to delete rows')
    }

    this.setState({ [key]: value }, () => {

      // update localStorage
      localSet(key, key === 'startDate' ? value : JSON.stringify(value))

      // update Firebase
      if (!localOnly) {

        // if syncing rows, update lastUpdated in localStorage
        if (key === 'rows') {
          localSet('lastUpdated', Date.now())
        }

        this.state.userRef.update(
          // if syncing rows, set the start date and lastUpdated
          key === 'rows' ? {
            rows: value,
            startDate: this.state.startDate,
            lastUpdated: Date.now()
          }
          // otherwise just set the value
          : { [key]: value }
        )
      }
    })
  }

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

  /**************************************************************
   * Render
   **************************************************************/

  render() {
    // used to vertically center the content
    const contentHeight = this.state.rows.length * 50
    const marginTop = Math.max(0, (window.innerHeight - contentHeight)/2 - 65)

    // expand rows

    // expand checkins from right to left
    const expandedRows = expandRows(this.state.rows, this.state.startDate, this.state.settings.decayDays)

    return <div
      className={'app' +
        (this.state.showSettings ? ' settings-active' : '')}
      // keep track of touch devices so that we can disable duplicate touch/mousedown events
      onTouchStart={() => this.setState({ touch: true })}
    >

      { // tutorial
        this.state.tutorial ? <div className='popup-container tutorial-container' onClick={() => this.setState({ tutorial: false })}>
          <div className='popup tutorial-popup'>
            <img className='tutorial-image' alt='screenshot1' src={tutorialImg}/>
            <p className='tutorial-text'>
              Keep track of habits! <span className='tutorial-colored-text tutorial-red'>Red</span>, <span className='tutorial-colored-text tutorial-yellow'>yellow</span>, <span className='tutorial-colored-text tutorial-green'>green</span>—you choose what each one means!<br/>
              <a className='button tutorial-button'>Let's Go!</a>
            </p>
          </div>
        </div> : null}

      { // notes
        this.state.noteEdit ? <div className='popup-container note-container'>
        <div className='popup note-popup'>
          <p className='note-label'>{this.state.noteEdit.z.label}</p>
          <p className='note-date'>{moment(this.state.startDate).add(this.state.noteEdit.z.checkins.length - this.state.noteEdit.ci - 1, 'days').format('dddd, MMMM Do')}</p>
          <textarea className='note-text' onInput={(e) => this.editNote(this.state.noteEdit.zi, this.state.noteEdit.ci, e.target.value)} defaultValue={this.state.noteEdit.z.notes && this.state.noteEdit.z.notes[this.state.noteEdit.z.checkins.length - this.state.noteEdit.ci - 1]}></textarea>
          <a className='button note-button' onClick={this.state.noteEditReady ? () => this.setState({ noteEdit: null, noteEditReady: false }) : null}>Close</a>
        </div>
      </div> : null}

      { // main content
        // do not render in background of notes on mobile; causes feint gridlines to appear when note closes
        !this.state.tutorial && !(this.state.touch && this.state.noteEdit) ? <div>
          <div className='status'>
            {this.state.offline ? <span className='status-offline'>Working Offline</span> :
            !this.state.user ? <span className='status-loading'>Signing in...</span>
            : null}
          </div>
          <div className='top-options'>
            {this.state.showSettings ? <span className='settings-content'>
              Decay (Mon-Sun): <span className='nowrap'>{[1, 2, 3, 4, 5, 6, 0].map(day =>
                <input key={day} type='checkbox' checked={this.state.settings.decayDays[day]} onChange={() => {
                  this.state.settings.decayDays.splice(day, 1, !this.state.settings.decayDays[day])
                  return this.sync('decayDays', this.state.settings.decayDays)}
                }/>
              )}</span><br/>
              Show today's checkins: <input type='checkbox' disabled={this.state.settings.showCheckins} checked={this.state.settings.showFadedToday} onChange={() => this.sync('showFadedToday', !this.state.settings.showFadedToday)} /><br/>
              Show all checkins: <input type='checkbox' checked={this.state.settings.showCheckins} onChange={() => this.sync('showCheckins', !this.state.settings.showCheckins)} /><br/>
              Night Mode 🌙: <input type='checkbox' checked={this.state.settings.night} onChange={() => {
                document.body.classList[!this.state.settings.night ? 'add' : 'remove']('night')
                this.sync('night', !this.state.settings.night, true)
              }} /><br />
              <a className='settings-showintro text-small' onClick={() => this.setState({ tutorial: true, showSettings: false })}>Show Intro</a><br/>
              <a className='settings-logout text-small' onClick={() => firebase.auth().signOut()}>Log Out</a><br/>
              <hr/>
              <div className='text-small'>
              {this.state.user ? <span>
                <span className='dim'>Logged in as: </span>{this.state.user.email}<br/>
                <span className='dim'>User ID: </span><span className='mono'>{this.state.user.uid}</span><br/>
              </span> : null}
              <span className='dim'>Version: </span>{pkg.version}
              </div>
            </span> : null}
            <span role='img' aria-label='settings' className={'settings-option' + (this.state.showSettings ? ' active' : '')} onClick={this.toggleSettings}>⚙️</span>
          </div>

          <div className='gradient'></div>
          <div className='desktop-mask'></div>
          <div className='content' style={{ marginTop }}>
            {expandedRows ? <div>
                <Dates checkins={this.state.rows[0].checkins}/>
                <div className='rows'>
                  {expandedRows.map(this.row)}
                  { // move col-options to settings if enough habits and two weeks of checkins
                    this.state.showSettings || expandedRows.length < 5 || expandedRows[0].checkins.length <= 14 ? <div className='left-controls col-options' style={{ top: marginTop + 65 + expandedRows.length * 50 - this.state.scrollY }}>
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
  }

  row(row, i) {
    const contentHeight = this.state.rows.length * 50
    const marginTop = Math.max(65, (this.state.windowHeight - contentHeight)/2)
    const top = marginTop + i*50 - this.state.scrollY
    return <div className='row' key={row.label}>
      <span className='left-controls' style={{ top }}>
        <span className='row-options'>
          { i > 0
            ? <span className='box option option-row' onClick={() => this.moveRowUp(row)}>↑</span>
            : <span className='box option option-row option-hidden'></span>
          }
          { i < this.state.rows.length-1
            ? <span className='box option option-row' onClick={() => this.moveRowDown(row)}>↓</span>
            : <span className='box option option-row option-hidden'></span>
          }
          <span className='box option option-row' onClick={() => this.removeRow(row)}>-</span>
        </span>
        <span className='box row-label' onClick={() => this.editRow(row)}>{row.label}</span>
      </span>
      <span className='checkins'>{row.checkins ? row.checkins.map((c, i) => {
        return this.checkin(row, c, i)
      }) : null}</span>
    </div>
  }

  checkin(row, c, i) {
    return <ClickNHold
      key={i}
      className='clicknhold'
      time={0.5}
      onStart={(e) => {
        this.setState({
          disableClick: false
        })
      }}
      onClickNHold={() => {
        if (!this.state.disableClick) {
          // TODO
          // this.setState({
          //   noteEdit: { z, zi, ci }
          // })

          // delayed actions
          window.setTimeout(() => {
            // focus on text box
            const noteText = document.querySelector('.note-text')
            if (noteText) {
              noteText.focus()
            }

            // enable close button
            // if this is not delayed, then overlapping touch events on the bottom rows cause the notes to accidentally close immediately after opening
            this.setState({
              noteEditReady: true
            })
          }, 350)
        }
      }}
      onEnd={(e, enough) => {
        // normal click event
        // treat mouse event as duplicate and ignore if on a touchscreen
        if (!this.state.disableClick && !enough && !(this.state.touch && e.type === 'mouseup')) {
          const prevCheckins = row.checkins.slice(i, i + row.decay + 1)
          this.changeState(prevCheckins, row.decay, c, i)
        }

        // must be disabled to avoid duplicate onMouseDown/onTouchStart that the ClickNHold component uses
        this.setState({
          disableClick: true
        })
      }}
    ><span onTouchMove={() => this.setState({ disableClick: true })} className={'box checkin checkin' + c.state + (
      // today
      ((this.state.settings.showFadedToday && i === 0) || this.state.settings.showCheckins) && !c.checkin ? ' faded' : '')}>
      {c.note ? <span className='note-marker'></span> : null}
    </span></ClickNHold>
  }
}

// const AppComponentConnected = connect(
//   (state, ownProps) => ({
//   }),
//   (dispatch, ownProps) => ({
//   })
// )(AppComponent)

const App = () => <Provider store={store}>
  <AppComponent/>
</Provider>

const Dates = connect()(({ checkins, dispatch }) =>
  <div className='dates'>
    <div className='box dates-mask'></div>
    {Object.keys(checkins || {}).map(date => {
      return <span key={date} className='box date' title={moment(date).format('dddd, M/D')}>{moment(date).format('D')}</span>
    })}
  </div>
)

export default App

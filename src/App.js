import React, { Component } from 'react'
import './App.css'
import * as moment from 'moment'
import * as pkg from '../package.json'
import tutorialImg from './tutorial.png'
import ClickNHold from 'react-click-n-hold'

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

const [/*STATE_RED*/, /*STATE_YELLOW*/, /*STATE_GREEN*/, STATE_NULL] = [-1,0,1,2]

// raineorshine@gmail.com test data: https://console.firebase.google.com/u/0/project/zonesofprep/database/zonesofprep/data/users/T9FGz1flWIf1sQU5B5Qf3q6d6Oy1
const defaultZones = JSON.stringify([{
  checkins: [STATE_NULL],
  label: '💤'
}, {
  checkins: [STATE_NULL],
  label: '🥗'
}, {
  checkins: [STATE_NULL],
  label: '👟'
}])

// firebase init
const firebase = window.firebase
firebase.initializeApp(firebaseConfig)
window.__DEBUG = {}
window.__DEBUG.signout = firebase.auth().signOut.bind(firebase.auth())

// init localStorage
if (!localStorage.zones) {
  localStorage.zones = defaultZones
}

if (!localStorage.showFadedToday) {
  localStorage.showFadedToday = 'true'
}

// manually add/remove class to body since it's outside the target element of render
document.body.classList[localStorage.night === 'true' ? 'add' : 'remove']('night')

/**************************************************************
 * Helper functions
 **************************************************************/

const promoteWithNull = c => (c + 2) % 4 - 1
// const demoteWithNull = c => (c + 4) % 4 - 1
const promote = c => (c + 2) % 3 - 1
const demote = c => (c - 2) % 3 + 1
// const promoteNoWrap = c => c < 1 ? c + 1 : 1
// const demoteNoWrap = c => c > -1 ? c - 1 : -1

/** Return a new checkin for a given zone with potential decay */
const checkinWithDecay = (zone, i=0) => {
  if (zone.decay && zone.checkins[i] > -1) {
    // check if the decay rate has been met
    // e.g. a zone with a decay rate of 3 will only decay after 3 days in a row without a checkin
    const checkinsInDecayZone = zone.checkins.slice(i, i + zone.decay)
    const readyToDecay = same(checkinsInDecayZone) && noManualCheckins(checkinsInDecayZone, zone)
    return readyToDecay ? demote(zone.checkins[i]) : zone.checkins[i]
  }
  else {
    return zone.checkins[i]
  }
}

/** Returns true if all items in the list are the same. */
const same = list => list.reduce((prev, next) => prev === next ? next : false) !== false

/** Returns true if none of the given checkins have a manual checkin. */
const noManualCheckins = (checkinsInDecayZone, zone) => checkinsInDecayZone.every((c,i) => !(zone.manualCheckins && zone.manualCheckins[zone.checkins.length - i + 1]))

/** Get all the zones with a new column at the beginning. Needed to be separated from setState so it can be used in the constructor. */
const getNewColumn = zones => {
  return zones.map(z => {
    if (z.checkins) {
      const checkin = z.checkins[0] !== undefined && z.checkins[0] !== STATE_NULL
        ? checkinWithDecay(z)
        : STATE_NULL
      z.checkins.unshift(checkin)
    }
    else {
      z.checkins = [STATE_NULL]
    }
    return z
  })
}

/* if missing days, fill them in */
const fill = (zones, startDate) => {
  const missingDays = moment().diff(startDate, 'days') - zones[0].checkins.length + 1
  return missingDays > 0
    ? fill(getNewColumn(zones), startDate)
    : zones
}

/**************************************************************
 * App
 **************************************************************/

class App extends Component {

  constructor() {
    super()

    // load data immediately from localStorage
    const defaultStartDate = localStorage.startDate || moment().subtract(6, 'days').toISOString()
    const startZones = fill(JSON.parse(localStorage.zones || defaultZones), defaultStartDate)
    this.state = {
      zones: startZones,
      startDate: defaultStartDate,
      showCheckins: localStorage.showCheckins === 'true',
      showFadedToday: localStorage.showFadedToday === 'true',
      night: localStorage.night === 'true',
      scrollY: window.scrollY,
      // start the tutorial if the user has not checked in yet
      tutorial: !localStorage.lastUpdated
    }

    // Set to offline mode in 5 seconds. Cancelled with successful login.
    const offlineTimer = window.setTimeout(() => {
      this.setState({ offline: true })
    }, 5000)

    // update scroll for fixing position:fixed controls
    window.addEventListener('scroll', () => {
      this.setState({ scrollY: window.scrollY })
    })

    window.addEventListener('keydown', e => {
      // close all popups if the escape key is hit
      if (e.keyCode === 27) {
        this.setState({
          noteEdit: null,
          tutorial: false
        })
      }
    })

    window.addEventListener('mousemove', () => {
      this.setState({ disableClick: true })
    })

    // check if user is logged in
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

      // load Firebase data
      userRef.on('value', snapshot => {
        const value = snapshot.val()

        if (value) {

          // update user information
          userRef.update({
            name: user.displayName,
            email: user.email
          })

          if (value.showCheckins) {
            this.toggleShowCheckins(value.showCheckins, true)
          }

          if (value.night) {
            this.toggleNightMode(value.night, true)
          }

          if (value.showFadedToday) {
            this.toggleShowFadedToday(value.showFadedToday, true)
          }

          const startDate = value.startDate || '2018-03-24T06:00:00.000Z'
          this.saveStartDate(startDate, true)

          // if Firebase data is newer than stored data, update localStorage
          if (value.lastUpdated > (localStorage.lastUpdated || 0)) {
            this.saveZones(fill(value.zones), true, startDate)
          }
          // do nothing if Firebase data is older than stored data
        }
        // if no Firebase data, initialize with defaults
        else {
          this.saveZones(null, true)
        }
      })
    })

    this.toggleSettings = this.toggleSettings.bind(this)
    this.toggleClearCheckin = this.toggleClearCheckin.bind(this)
    this.toggleShowCheckins = this.toggleShowCheckins.bind(this)
    this.toggleNightMode = this.toggleNightMode.bind(this)
    this.zone = this.zone.bind(this)
    this.checkin = this.checkin.bind(this)
    this.dates = this.dates.bind(this)
    this.render = this.render.bind(this)
    this.addColumn = this.addColumn.bind(this)
    this.addRow = this.addRow.bind(this)
    this.editNote = this.editNote.bind(this)
  }

  /**************************************************************
   * State Change
   **************************************************************/

  toggleSettings() {
    this.setState({ showSettings: !this.state.showSettings })
  }

  toggleClearCheckin() {
    this.setState({ clearCheckin: !this.state.clearCheckin })
  }

  toggleShowFadedToday(value, localOnly) {
    value = value || !this.state.showFadedToday
    this.setState({ showFadedToday: value }, () => {

      // update localStorage
      localStorage.showFadedToday = JSON.stringify(value)

      // update Firebase
      if (!localOnly) {
        this.state.userRef.update({ showFadedToday: value })
      }
    })
  }

  toggleShowCheckins(value, localOnly) {
    value = value || !this.state.showCheckins
    this.setState({ showCheckins: value }, () => {

      // update localStorage
      localStorage.showCheckins = JSON.stringify(value)

      // update Firebase
      if (!localOnly) {
        this.state.userRef.update({ showCheckins: value })
      }
    })
  }

  toggleNightMode(value, localOnly) {
    value = value || !this.state.night

    // manually add/remove class to body since it's outside the target element of render
    document.body.classList[value ? 'add' : 'remove']('night')

    this.setState({ night: value }, () => {

      // update localStorage
      localStorage.night = JSON.stringify(value)

      // do not sync this settings to Firebase (per-device)
    })
  }

  /** Save given zones or state zones to state, localStorage, and (optionally) Firebase. */
  saveStartDate(startDate, localOnly) {
    this.setState({ startDate }, () => {

      // update localStorage
      localStorage.startDate = startDate

      // update Firebase
      if (!localOnly) {
        this.state.userRef.update({ startDate })
      }
    })
  }

  /** Save given zones or state zones to state, localStorage, and (optionally) Firebase. */
  saveZones(zones, localOnly) {
    zones = zones || this.state.zones
    this.setState({ zones }, () => {

      // update localStorage
      localStorage.zones = JSON.stringify(zones)

      if (!localOnly) {
        localStorage.lastUpdated = Date.now()

        // update Firebase
        this.state.userRef.update({
          zones,
          startDate: this.state.startDate,
          lastUpdated: Date.now()
        })
      }
    })
  }

  // toggle the state of a checkin
  changeState(z, i) {
    z.manualCheckins = z.manualCheckins || {}

    // get conditions and values for determining a decayed checkin
    const decayedCheckin = checkinWithDecay(z, i+1)
    const prevCheckinNull = z.checkins[i+1] === undefined || z.checkins[i+1] === STATE_NULL
    const useDecayedCheckin =
      // clear checkin tool
      this.state.clearCheckin ||
      // if today, rotate through decayed checkin
      // (add rotation after decayed checkin matches next checkin)
      (i === 0 && this.state.showFadedToday && z.manualCheckins[z.checkins.length - i] && z.checkins[i] === decayedCheckin && !prevCheckinNull)

    // set new checkin and manual checkin
    z.checkins.splice(i, 1, useDecayedCheckin ? decayedCheckin :
      prevCheckinNull ? promoteWithNull(z.checkins[i]) : promote(z.checkins[i]))
    z.manualCheckins[z.checkins.length - i] = !useDecayedCheckin

    this.saveZones()
  }

  addColumn() {
    this.saveZones(getNewColumn(this.state.zones))
  }

  addRow() {
    const label = prompt('Enter an emoji for your new habit:')
    if (!label) return

    const decay = +prompt('Enter a decay rate. You may enter a value greater than 0 to have the new day\'s checkin decrease if that many days has passed without change. For example, a habit with a decay rate of 3 will automatically decrease after 3 identical checkins in a row.', 0)

    const sampleCheckins = this.state.zones[0].checkins || []
    const zones = this.state.zones.concat([
      {
        label,
        decay,
        checkins: sampleCheckins.concat().fill(STATE_NULL)
      }
    ])
    this.saveZones(zones)
  }

  editRow(z) {
    const label = prompt(`Enter a new emoji for ${z.label}:`, z.label)
    if (!label) return

    const decay = +prompt('Enter a decay rate. You may enter a value greater than 0 to have the new day\'s checkin decrease if that many days has passed without change. For example, a habit with a decay rate of 3 will automatically decrease after 3 identical checkins in a row.', z.decay)

    z.label = label
    z.decay = decay
    this.saveZones()
  }

  moveRowDown(z) {
    const zones = this.state.zones.concat()
    const i = zones.indexOf(z)
    zones.splice(i, 1)
    zones.splice(i+1, 0, z)
    this.saveZones(zones)
  }

  moveRowUp(z) {
    const zones = this.state.zones.concat()
    const i = zones.indexOf(z)
    zones.splice(i, 1)
    zones.splice(i-1, 0, z)
    this.saveZones(zones)
  }

  removeRow(z) {
    if (window.confirm(`Are you sure you want to delete ${z.label}?`)) {
      const zones = this.state.zones.concat()
      zones.splice(zones.indexOf(z), 1)
      this.saveZones(zones)
    }
  }

  removeColumn() {
    const zones = this.state.zones.map(z => {
      z.checkins.shift()
      return z
    })
    this.saveZones(zones)
  }

  editNote(z, i, text) {
    z.notes = z.notes || {}
    z.notes[z.checkins.length - i - 1] = text
    this.saveZones()
  }

  /**************************************************************
   * Render
   **************************************************************/

  render() {
    return <div
      className={'app' +
        (this.state.clearCheckin ? ' clear-checkin' : '') +
        (this.state.showSettings ? ' settings-active' : '')}
      // keep track of touch devices so that we can disable duplicate touch/mousedown events
      onTouchStart={() => this.setState({ touch: true })}
    >
      {
        // tutorial
        this.state.tutorial ? <div className='popup-container tutorial-container' onClick={() => this.setState({ tutorial: false })}>
          <div className='popup tutorial-popup'>
            <img className='tutorial-image' alt='screenshot1' src={tutorialImg}/>
            <p className='tutorial-text'>
              Keep track of habits! <span className='tutorial-colored-text tutorial-red'>Red</span>, <span className='tutorial-colored-text tutorial-yellow'>yellow</span>, <span className='tutorial-colored-text tutorial-green'>green</span>—you choose what each one means!<br/>
              <a className='button tutorial-button'>Let's Go!</a>
            </p>
          </div>
        </div> :

        // main content
        <div>
          <div className='status'>
            {this.state.offline ? <span className='status-offline'>Working Offline</span> :
            !this.state.user ? <span className='status-loading'>Signing in...</span>
            : null}
          </div>
          <div className='top-options'>
            {this.state.showSettings ? <span className='settings-content'>
              {this.state.user ? <span>
                <span className='dim'>Logged in as: </span>{this.state.user.email}<br/>
                <span className='dim'>User ID: </span><span className='mono'>{this.state.user.uid}</span><br/>
              </span> : null}
              <span className='dim'>Version: </span>{pkg.version}<br/>
              <hr/>
              Fade today's habits without checkins: <input type='checkbox' checked={this.state.showFadedToday} onChange={() => this.toggleShowFadedToday()} /><br/>
              Fade all habits without checkins: <input type='checkbox' checked={this.state.showCheckins} onChange={() => this.toggleShowCheckins()} /><br/>
              Night Mode 🌙: <input type='checkbox' checked={this.state.night} onChange={() => this.toggleNightMode()} /><br />
              Clear checkin tool: <input type='checkbox' checked={this.state.clearCheckin} onChange={this.toggleClearCheckin} /><br />
              <a className='settings-showintro' onClick={() => this.setState({ tutorial: true, showSettings: false })}>Show Intro</a><br/>
              <a className='settings-logout' onClick={() => firebase.auth().signOut()}>Log Out</a>
            </span> : null}
            <span role='img' aria-label='settings' className={'settings-option' + (this.state.showSettings ? ' active' : '')} onClick={this.toggleSettings}>⚙️</span>
          </div>

          {this.state.noteEdit ? <div className='popup-container note-container'>
            <div className='popup note-popup'>
              <p className='note-label'>{this.state.noteEdit.z.label}</p>
              <p className='note-date'>{moment(this.state.startDate).add(this.state.noteEdit.z.checkins.length - this.state.noteEdit.i - 1, 'days').format('dddd, MMMM Do')}</p>
              <textarea className='note-text' onInput={(e) => this.editNote(this.state.noteEdit.z, this.state.noteEdit.i, e.target.value)} defaultValue={this.state.noteEdit.z.notes && this.state.noteEdit.z.notes[this.state.noteEdit.z.checkins.length - this.state.noteEdit.i - 1]}></textarea>
              <a className='button note-button' onClick={() => this.setState({ noteEdit: null})}>Close</a>
            </div>
          </div> : null}

          <div className='gradient'></div>
          <div className='desktop-mask'></div>
          <div className='content'>
            {this.state.zones ? <div>
                {this.dates()}
                <div className='zones'>
                  {this.state.zones.map(this.zone)}
                </div>
                <div className='col-options'>
                  <span className='box'>
                    <span className='box option col-option' onClick={this.addRow}>+</span>
                  </span>
                </div>
              </div>
              : <p className='loading'>Loading data...</p>
            }
          </div>
        </div>
      }
    </div>
  }

  zone(z, i) {
    return <div className='zone' key={z.label}>
      <span className='left-controls' style={{ top: 115 + i*50 - this.state.scrollY }}>
        <span className='row-options'>
          { i > 0
            ? <span className='box option option-row' onClick={() => this.moveRowUp(z)}>↑</span>
            : <span className='box option option-row option-hidden'></span>
          }
          { i < this.state.zones.length-1
            ? <span className='box option option-row' onClick={() => this.moveRowDown(z)}>↓</span>
            : <span className='box option option-row option-hidden'></span>
          }
          <span className='box option option-row' onClick={() => this.removeRow(z)}>-</span>
        </span>
        <span className='box zone-label' onClick={() => this.editRow(z)}>{z.label}</span>
      </span>
      <span className='checkins'>{z.checkins
        ? z.checkins.map((c, i) => this.checkin(c, i, z))
        : null
       }</span>
    </div>
  }

  checkin(c, i, z) {
    const hasNote = z.notes && z.notes[z.checkins.length - i - 1]
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
          this.setState({
            noteEdit: { z, i }
          })

          // focus (after render)
          window.setTimeout(() => {
            const noteText = document.querySelector('.note-text')
            if (noteText) {
              noteText.focus()
            }
          }, 350)
        }
      }}
      onEnd={(e, enough) => {
        // normal click event
        // treat mouse event as duplicate and ignore if on a touchscreen
        if (!this.state.disableClick && !enough && !(this.state.touch && e.type === 'mouseup')) {
          this.changeState(z, i)
        }

        // must be disableed to avoid duplicate onMouseDown/onTouchStart that the ClickNHold component uses
        this.setState({
          disableClick: true
        })
      }}
    ><span onTouchMove={() => this.setState({ disableClick: true })} className={'box checkin checkin' + c + (
      // today
      ((this.state.showFadedToday && i === 0) || this.state.showCheckins) &&
      (!z.manualCheckins || !z.manualCheckins[z.checkins.length - i]) ? ' faded' : '')}>
      {hasNote ? <span className='note-marker'></span> : null}
    </span></ClickNHold>
  }

  dates() {
    const sampleCheckins = this.state.zones[0].checkins || []

    return <div className='dates'>
      {sampleCheckins.map((checkin, i) => {
        const date = moment(this.state.startDate).add(sampleCheckins.length - i - 1, 'days')
        return <span key={i} className='box date' title={date.format('dddd, M/D')}>{date.format('D')}</span>
      })}
    </div>
  }
}

export default App

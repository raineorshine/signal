import React, { Component } from 'react'
import './App.css'
import * as moment from 'moment'

const firebaseConfig = {
  apiKey: "AIzaSyA58BMqwEAw12sgI4guZbsDdVZ7yoXwDqI",
  authDomain: "zonesofprep.firebaseapp.com",
  databaseURL: "https://zonesofprep.firebaseio.com",
  projectId: "zonesofprep",
  storageBucket: "zonesofprep.appspot.com",
  messagingSenderId: "918887966885"
}

const [/*STATE_RED*/, /*STATE_YELLOW*/, /*STATE_GREEN*/, STATE_NULL] = [-1,0,1,2]
const defaultData = {
  zones: [{
    checkins: [0],
    label: '💤'
  }, {
    checkins: [0],
    label: '🥗'
  }, {
    checkins: [0],
    label: '👟'
  }, {
    checkins: [0],
    label: '📿'
  }, {
    checkins: [0],
    label: '💌'
  }, {
    checkins: [0],
    label: '🏡'
  }, {
    checkins: [0],
    label: '🔧'
  }]
}

// firebase init
const firebase = window.firebase
firebase.initializeApp(firebaseConfig)
window.firebase = firebase
// firebase.auth().signOut()

const isMobile = () => {
  return navigator.userAgent.match(/Android/i)
    || navigator.userAgent.match(/iPhone/i)
    || navigator.userAgent.match(/iPad/i)
    || navigator.userAgent.match(/iPod/i)
    || navigator.userAgent.match(/BlackBerry/i)
    || navigator.userAgent.match(/Windows Phone/i)
    || navigator.userAgent.match(/Opera Mini/i)
    || navigator.userAgent.match(/IEMobile/i)
}

class App extends Component {
  constructor() {
    super()
    this.state = {}

    // check if user is logged in
    firebase.auth().onAuthStateChanged(user => {

      // if logged in, save the user into state
      if (user) {
        const userRef = firebase.database().ref('users/' + user.uid)
        this.setState({ userRef, uid: user.uid })

        // load user data
        userRef.on('value', snapshot => {
          const value = snapshot.val()

          // if no data, initialize with defaults
          if (!value)  {
            userRef.set(defaultData)
          }
          // if data, setState to render
          else {
            this.setState({ zones: value.zones })
          }
        })
      }
      // if not logged in, redirect to OAuth login
      else {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithRedirect(provider)
      }
    })

    this.zone = this.zone.bind(this)
    this.checkin = this.checkin.bind(this)
    this.dates = this.dates.bind(this)
    this.render = this.render.bind(this)
  }

  // toggle the state of a checkin
  changeState(z, i) {
    const value = (z.checkins[i] + 2) % 4 - 1
    z.checkins.splice(i, 1, value)
    this.state.userRef.set({ zones: this.state.zones })
  }

  addColumn() {
    this.state.userRef.set({
      zones: this.state.zones.map(z => {
        if (z.checkins) {
          z.checkins.unshift(z.checkins[0] !== undefined ? z.checkins[0] : STATE_NULL)
        }
        else {
          z.checkins = [STATE_NULL]
        }
        return z
      })
    })
  }

  addRow(label) {
    const sampleCheckins = this.state.zones[0].checkins || []
    const zones = this.state.zones.concat([
      {
        label,
        checkins: sampleCheckins.concat().fill(STATE_NULL)
      }
    ])
    this.state.userRef.set({ zones })
  }

  moveRowDown(z) {
    const zones = this.state.zones.concat()
    const i = zones.indexOf(z)
    zones.splice(i, 1)
    zones.splice(i+1, 0, z)
    this.state.userRef.set({ zones })
  }

  moveRowUp(z) {
    const zones = this.state.zones.concat()
    const i = zones.indexOf(z)
    zones.splice(i, 1)
    zones.splice(i-1, 0, z)
    this.state.userRef.set({ zones })
  }

  removeRow(z) {
    const zones = this.state.zones.concat()
    zones.splice(zones.indexOf(z), 1)
    this.state.userRef.set({ zones })
  }

  removeColumn() {
    const zones = this.state.zones.map(z => {
      z.checkins.shift()
      return z
    })
    this.state.userRef.set({ zones })
  }

  render() {
    return <div className='app'>
      <div className='gradient'></div>
      <div className='content'>
        {this.state.zones ? <div>
            {this.dates()}
            <div className='zones'>
              {this.state.zones.map(this.zone)}
              <div className='row-options'>
                <span className='box option row-option' onClick={() => {
                  const label = prompt('Enter an emoji for the label of your new habit:')
                  if (label) {
                    this.addRow(label)
                  }
                }}>+</span>
              </div>
            </div>
            <div className='col-options'>
              <span className='box col1'></span>
              <span className='box option col-option'
                onTouchStart={isMobile() ? () => this.addColumn() : null}
                onClick={isMobile() ? null : () => this.addColumn()}
              >+</span>
              <span className='box option col-option'
                onTouchStart={isMobile() ? () => this.removeColumn() : null}
                onClick={isMobile() ? null : () => this.removeColumn()}
              >-</span>
            </div>
          </div>
          : this.state.uid ? <p>Loading data...</p>
          : <p>Signing in...</p>
        }
      </div>
    </div>
  }

  zone(z, i) {
    return <div className='zone' key={z.label}>
      { i > 0
        ? <span className='box option option-row' onClick={() => this.moveRowUp(z)}>↑</span>
        : <span className='box option option-row option-hidden'></span>
      }
      { i < this.state.zones.length-1
        ? <span className='box option option-row' onClick={() => this.moveRowDown(z)}>↓</span>
        : <span className='box option option-row option-hidden'></span>
      }
      <span className='box option option-row' onClick={() => this.removeRow(z)}>-</span>
      <span className='box col1 zone-label'>{z.label}</span>
      <span className='checkins'>{z.checkins
        ? z.checkins.map((c, i) => this.checkin(c, i, z))
        : null
       }</span>
    </div>
  }

  checkin(c, i, z) {
    return <span key={i} className={'box checkin checkin' + c}
      onTouchStart={isMobile() ? () => this.changeState(z, i) : null}
      onClick={isMobile() ? null : () => this.changeState(z, i)}
    ></span>
  }

  dates() {
    const startDate = moment('20180324')
    const sampleCheckins = this.state.zones[0].checkins || []

    return <div className='dates'>
      {sampleCheckins.map((checkin, i) => {
        const date = moment(startDate).add(sampleCheckins.length - i - 1, 'days')
        return <span key={i} className='box date' title={date.format('dddd, M/D')}>{date.format('D')}</span>
      })}
    </div>
  }
}

export default App

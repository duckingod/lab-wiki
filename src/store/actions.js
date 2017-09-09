import 'assets/js/platform'
import { gAuthSettings, gClientSettings, entry } from 'config'
import $ from 'ajax'

const loginUrl = entry + '/login'
const logoutUrl = entry + '/logout'
const userUrl = entry + '/user'

const getUserRole = async () => {
  let { response: user } = await $.get({ url: userUrl })
  return user.role
}

let authentications = {
  gLoadAuth() {
    return new Promise(resolve =>
      gapi.load('client:auth2', resolve)
    )
  },
  async gAuthInit({ commit, dispatch }) {
    await dispatch('gLoadAuth')
    await gapi.client.init(gClientSettings)
    let gAuth = gapi.auth2.getAuthInstance()
    commit('gAuth', gAuth)
    await gAuth.then()

    let user = gAuth.currentUser.get()
    if (user) {
      commit('user', user)
      commit('userRole', await getUserRole())
    }

    return [gAuth]
  },
  async gSignIn({ state: { gAuth }, commit, dispatch }) {
    if (!gapi.auth2) {
      gAuth = (await dispatch('gAuthInit'))[0]
    }
    else {
      await gAuth.then()
    }
    let user
    try {
      user = await gAuth.signIn({
        prompt: 'select_account'
      })
    }
    catch ({ error }) {
      throw Error(`gAuth.signIn Error: ${error}`)
    }
    commit('user', user)
    return user
  },
  async signIn({ dispatch, commit }) {
    let user
    try {
      user = await dispatch('gSignIn')
    }
    catch (e) {
      return
    }
    let { status } = await $.post({
      url: loginUrl,
      data: { id_token: user.getAuthResponse().id_token }
    })
    commit('userRole', await getUserRole())
    commit('status', status)
  },
  async gSignOut({ state: { gAuth }, commit, dispatch }) {
    if (gAuth === null) {
      gAuth = (await dispatch('gAuthInit'))[0]
    }
    try {
      await gAuth.signOut()
    }
    catch ({ error }) {
      throw Error(`gAuth.signOut Error: ${error}`)
    }
    commit('user', null)
  },
  async signOut({ dispatch, commit }) {
    await dispatch('gSignOut')
    await $.post({ url: logoutUrl })
    commit('status', 401)
  }
}

export default {
  ...authentications,
  async crud({ commit, dispatch }, { type, path, data, id }) {
    let reqType = {
      create: 'post',
      read: 'get',
      update: 'post',
      delete: 'delete',
    }[type] || type

    let { response, status } = await $[reqType]({
      url: entry + path + (id? `/${id}`:''),
      data
    })
    commit('status', status)

    if (status !== 200) return null
    if (type !== 'read') return await dispatch('crud',{ path, type: 'read' })
    return response
  },
}

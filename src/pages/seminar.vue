<template>
  <v-container>
    <v-layout mb-3>
      <v-spacer/>
      <v-text-field
        v-model="search"
        append-icon="search"
        label="Search (support regex)"
        single-line
        hide-details/>
    </v-layout>
    <datatable
      v-bind="table"
      v-model="table.value"
      @update:pagination="updatePagination"/>
    <component
      :is="dialog.component"
      v-model="dialog.value"
      :title="dialog.title"
      :fields="dialog.fields"
      :display.sync="dialog.display"
      :target="dialog.target"
      :reset="dialog.reset"
      id-field="seminarId"
      width="35rem"
      @submit="dialog.onSubmit"/>
    <manage-panel
      :dialog="dialog"
      :dialogs="dialogs"
      :selected="table.value"
      :tooltip="tooltip"
      :schedule="true"
      :set-data="setData"/>
  </v-container>
</template>

<script>

import debounce from 'lodash.debounce'
import { mapGetters } from 'vuex'
import { gDriveSlidesFolderID, gSuiteDomain } from 'config'
import datatable from 'components/datatable.vue'
import formDialog from 'components/form-dialog.vue'
import scheduleDialog from 'components/schedule-dialog.vue'
import managePanel from 'components/manage-panel.vue'

const boundary = '-------henry_is_god__henrygod_is_soooooo_god'
const multipartRequestBody = ({ boundary, metadata, fileType, fileContent }) =>
  `
--${boundary}
Content-Type: application/json

${JSON.stringify(metadata)}
--${boundary}
Content-Type: ${fileType}
Content-Transfer-Encoding: base64

${fileContent}
--${boundary}--`

export default {
  components: { datatable, formDialog, scheduleDialog, managePanel },
  data () {
    return {
      table: {
        search: '',
        loading: true,
        headers: [
          'date',
          'presenter',
          {
            value: 'topic',
            display: (value, text) =>
              text + (value.slides ? ` <a href="${value.slides}" target="_blank">Slide</a>` : '')
          }
        ],
        items: [],
        pagination: {
          sortBy: 'date',
          rowsPerPage: 10,
          descending: true,
          page: 1
        },
        actions: true,
        actionIcons: [
          {
            icon: 'edit',
            color: 'teal',
            show: item => this.editable(item),
            action: item => {
              this.dialogs.item = item
              Object.assign(this.dialog, this.dialogs.update)
              this.dialog.fields[2].display = fp => this.dialog.title === this.dialogs.update.title ? fp || item.topic.slides : fp
              this.dialog.display = true
            }
          }
        ],
        selectAll: false,
        enableSelect: false,
        value: []
      },
      search: '',
      dialog: {
        title: null,
        fields: [
          { name: 'date', label: 'Date', required: true, component: 'date-picker' },
          { name: 'presenter', label: 'Presenter', required: true, component: 'member-selector' },
          { name: 'slide', label: 'Slide', icon: 'slideshow', component: 'file-picker' },
          { name: 'topic', label: 'Topic', multiLine: true, component: 'v-text-field' }
        ],
        value: null,
        onSubmit: this.updateData,
        display: false,
        item: null,
        target: null
      },
      dialogs: {
        item: { topic: {} },
        updateData: this.updateData,
        localeString: this.localeString,
        vm: this,
        create: {
          component: 'form-dialog',
          title: 'Add Seminar',
          value: null,
          item: null,
          reset: null
        },
        get update () {
          let item = this.item
          let value = {
            date: item.date,
            // preventing error when item.presenter is null (for vue debugger)
            presenter: item.presenter && item.presenter.display,
            slide: '',
            topic: item.topic.text
          }
          return {
            component: 'form-dialog',
            title: 'Update Seminar',
            value,
            item,
            reset: () => { this.vm.dialog.value = value }
          }
        },
        schedule: {
          component: 'schedule-dialog',
          title: 'Schedule Seminar',
          target: this.$route.path,
          onSubmit: (data) => this.setData(data)
        }
      }
    }
  },
  computed: {
    serverFormatData () {
      let { date, presenter, topic } = this.dialog.value
      let { item } = this.dialog
      return {
        date,
        slides: item ? item.topic.slides : '',
        topic: topic || '',
        presenter: presenter.name,
        owner: presenter.account + '@' + gSuiteDomain
      }
    },
    ...mapGetters(['userEmail'])
  },
  watch: {
    search: debounce(function () {
      this.table.search = this.search
    }, 500),
    userRole (newVal) {
      this.table.enableSelect = this.isAdmin
    }
  },
  created () {
    this.crud()
  },
  mounted () {
    this.table.enableSelect = this.isAdmin
  },
  methods: {
    setData (data) {
      this.table.items = data.map(d => ({
        date: d.date,
        presenter: {
          display: d.presenter,
          search: d.owner + ' ' + d.presenter,
          sort: d.presenter
        },
        topic: {
          sort: d.topic,
          text: d.topic,
          slides: d.slides || ''
        },
        owner: d.owner,
        id: d.id
      }))
      this.$once('update:pagination', this.toPageOfNow)
      this.table.loading = false
    },
    async uploadFile (file) {
      let reader = new FileReader()
      reader.readAsBinaryString(file)
      await new Promise(resolve => { reader.onload = resolve })
      let metadata = {
        name: file.name,
        parents: gDriveSlidesFolderID, // Upload to 'slides'
        mimeType: file.type
      }
      let fileContent = btoa(reader.result) // base64 encoding

      return gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: {
          uploadType: 'multipart'
        },
        headers: {
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartRequestBody({
          boundary,
          fileType: file.type,
          fileContent,
          metadata
        })
      })
    },
    async updateData (resolve) {
      let data = this.serverFormatData
      let { slide } = this.dialog.value
      if (slide) {
        let { result, status } = await this.uploadFile(slide)
        if (status === 200) {
          data.slides = `https://drive.google.com/open?id=${result.id}`
        }
      }
      let id = this.dialog.item ? this.dialog.item.id : undefined
      await this.crud({ type: 'post', data, id })
      resolve()
    },
    editable (item) {
      return item.owner === this.userEmail || this.isAdmin
    },
    tooltip (selectedItem) {
      return selectedItem.map(item =>
        `${this.localeString(item.date, 'Date')} ${item.presenter.display}`
      )
    },
    toPageOfNow () {
      let { pagination, items } = this.table
      let { rowsPerPage, descending } = pagination
      pagination.sortBy = 'date'
      let nRowsBefore = items.reduce((pre, cur) => pre + (Date.parse(cur.date) > Date.now()), 0)
      if (!descending) nRowsBefore = items.length - nRowsBefore
      pagination.page = Math.ceil(nRowsBefore / rowsPerPage) || 1
      return nRowsBefore
    },
    updatePagination (pagination) {
      // the v-data-table will update pagination after new datatable items being set,
      // so, we can only get our custom pagination update **after** that
      // (using $once to catch the resulting pagination change event)
      this.table.pagination = pagination
      this.$emit('update:pagination')
    }
  }
}
</script>

<style lang="stylus">
  td.date
    width: 9rem
    text-align: center
  td.presenter
    text-align: center
</style>

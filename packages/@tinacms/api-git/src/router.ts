/**

Copyright 2019 Forestry.io Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

import { writeFile, deleteFile } from './file-writer'

import * as fs from 'fs'
import * as path from 'path'
import * as express from 'express'

import { commit } from './commit'
import { createUploader } from './upload'
import { openRepo } from './open-repo'

export interface GitRouterConfig {
  pathToRepo?: string
  pathToContent?: string
  defaultCommitMessage?: string
  defaultCommitName?: string
  defaultCommitEmail?: string
}
export function router(config: GitRouterConfig = {}) {
  const REPO_ABSOLUTE_PATH = config.pathToRepo || process.cwd()
  const CONTENT_REL_PATH = config.pathToContent || ''
  const CONTENT_ABSOLUTE_PATH = path.join(REPO_ABSOLUTE_PATH, CONTENT_REL_PATH)
  const TMP_DIR = path.join(CONTENT_ABSOLUTE_PATH, '/tmp/')
  const DEFAULT_COMMIT_MESSAGE =
    config.defaultCommitMessage || 'Update from Tina'

  const uploader = createUploader(TMP_DIR)

  const router = express.Router()
  router.use(express.json())

  router.delete('/:relPath', (req: any, res: any) => {
    const fileRelativePath = decodeURIComponent(req.params.relPath)
    const fileAbsolutePath = path.join(CONTENT_ABSOLUTE_PATH, fileRelativePath)

    try {
      deleteFile(fileAbsolutePath)
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message })
    }

    commit({
      pathRoot: REPO_ABSOLUTE_PATH,
      name: req.body.name || config.defaultCommitName,
      email: req.body.email || config.defaultCommitEmail,
      message: `Update from Tina: delete ${fileRelativePath}`,
      files: [fileAbsolutePath],
    })
      .then(() => {
        res.json({ status: 'success' })
      })
      .catch(e => {
        res.status(500).json({ status: 'error', message: e.message })
      })
  })

  router.put('/:relPath', (req: any, res: any) => {
    const fileRelativePath = decodeURIComponent(req.params.relPath)
    const fileAbsolutePath = path.join(CONTENT_ABSOLUTE_PATH, fileRelativePath)

    if (DEBUG) {
      console.log(fileAbsolutePath)
    }
    try {
      writeFile(fileAbsolutePath, req.body.content)
      res.json({ content: req.body.content })
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message })
    }
  })

  router.post('/upload', uploader.single('file'), (req: any, res: any) => {
    try {
      const fileName = req.file.originalname
      const tmpPath = path.join(TMP_DIR, fileName)
      const finalPath = path.join(
        REPO_ABSOLUTE_PATH,
        req.body.directory,
        fileName
      )
      fs.rename(tmpPath, finalPath, (err: any) => {
        if (err) console.error(err)
      })
      res.send(req.file)
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message })
    }
  })

  router.post('/commit', (req: any, res: any) => {
    const message = req.body.message || DEFAULT_COMMIT_MESSAGE
    const files = req.body.files.map((rel: string) =>
      path.join(CONTENT_ABSOLUTE_PATH, rel)
    )
    // TODO: Separate commit and push???
    commit({
      pathRoot: REPO_ABSOLUTE_PATH,
      name: req.body.name,
      email: req.body.email,
      message,
      files,
    })
      .then(() => {
        res.json({ status: 'success' })
      })
      .catch(e => {
        // TODO: More intelligently respond
        res.status(412)
        res.json({ status: 'failure', error: e.message })
      })
  })

  router.post('/reset', (req, res) => {
    let repo = openRepo(REPO_ABSOLUTE_PATH)
    const files = req.body.files.map((rel: string) =>
      path.join(CONTENT_ABSOLUTE_PATH, rel)
    )
    if (DEBUG) console.log(files)
    repo
      .checkout(files[0])
      .then(() => {
        res.json({ status: 'success' })
      })
      .catch((e: any) => {
        res.status(412)
        res.json({ status: 'failure', error: e.message })
      })
  })

  router.get('/show/:fileRelativePath', (req, res) => {
    let repo = openRepo(REPO_ABSOLUTE_PATH)

    let filePath = path
      .join(CONTENT_REL_PATH, req.params.fileRelativePath)
      .replace(/^\/*/, '')

    repo
      .show([`HEAD:${filePath}`])
      .then((data: any) => {
        res.json({
          fileRelativePath: req.params.fileRelativePath,
          content: data,
          status: 'success',
        })
      })
      .catch((e: any) => {
        res.status(501)
        res.json({
          status: 'failure',
          message: e.message,
          fileRelativePath: req.params.fileRelativePath,
        })
      })
  })

  return router
}

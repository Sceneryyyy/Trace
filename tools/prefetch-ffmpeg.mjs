// Install the source-built runtime only after source, build and EXE validation.
import {createRequire} from 'node:module'
const {install}=createRequire(import.meta.url)('./codec/install.cjs')
await install()

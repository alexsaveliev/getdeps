/// <reference path="../typings/node/node.d.ts"/>
/// <reference path="../typings/semver/semver.d.ts"/>
/// <reference path="../typings/async/async.d.ts"/>

import * as url_ from 'url'

import * as async_ from 'async'
import * as semver from 'semver'

const githubUrl = require('github-url-from-username-repo')
const gitUrl = require('github-url-from-git')
const npm = require('npm')

/**
 * NPM dependency
 */
export type Dependency = {
    version?: string
    repo?: string
    commit?: string
}

/**
 * Repository and commit information
 */
type RepoAndCommit = {
    repo: string
    commit: string
}

/**
 * Callback invoked when all dependencies were fetched
 */
export type DependenciesResolvedCallback = (dependencies: Map<string, Dependency>) => void

/**
 * Splits URL to repository and commit parts  
 */
function getRepoAndCommit(url: string): RepoAndCommit {
    const pos = url.indexOf('#')
    let repo, commit: string
    if (pos > 0) {
        repo = url.substring(0, pos)
        commit = url.substring(pos + 1)
    } else {
        repo = url
        commit = null
    }
    return { repo: gitUrl(repo) || repo, commit: commit }
}

/**
 * Resolves single dependency
 */
function resolve(dependency: string, version: string, dependencies: Map<string, Dependency>): AsyncFunction<Dependency> {
    return function (callback: (err?: Error, dependency?: Dependency) => void) {
        let u = githubUrl(version)
        if (u) {
            // user/repo form
            const repoAndCommit = getRepoAndCommit(u)
            dependencies.set(dependency, { repo: repoAndCommit.repo, commit: repoAndCommit.commit })
            return callback()
        }
        if (/\//.test(version)) {
            const u = url_.parse(version)
            if (!/^(?:https?:|git[+:])/.test(u.protocol)) {
                return callback()
            }
            const repoAndCommit = getRepoAndCommit(version)
            dependencies.set(dependency, { repo: repoAndCommit.repo, commit: repoAndCommit.commit })
            return callback()
        }
        npm.commands.view([dependency, 'versions', 'repository', 'gitHead', 'version'], true, function (err: Error, result: any) {
            if (err) {
                return callback()
            }
            const keys = Object.keys(result)
            if (keys.length == 0) {
                return callback()
            }
            const key = keys[0]
            const v = semver.maxSatisfying(result[key].versions || [], version)
            if (!v) {
                return callback()
            }
            if (v == result[key].version) {
                dependencies.set(dependency, { version: v, repo: (result[key].repository || {}).url, commit: result[key].gitHead })
                return callback()
            }
            npm.commands.view([dependency + '@' + v, 'repository', 'gitHead'], true, function (err: Error, result: any) {
                if (err) {
                    return callback()
                }
                const keys = Object.keys(result)
                if (keys.length == 0) {
                    return callback()
                }
                const key = keys[0]
                dependencies.set(dependency, { version: v, repo: (result[key].repository || {}).url, commit: result[key].gitHead })
                return callback()
            })
        })
    }
}

/**
 * Resolves all given dependencies asynchronously in parallel
 */
export function resolveAll(dependencies: Map<string, string>, callback: DependenciesResolvedCallback) {
    let tasks: AsyncFunction<Dependency>[] = []
    let result: Map<string, Dependency> = new Map<string, Dependency>()
    dependencies.forEach(function (v, k) {
        tasks.push(resolve(k, v, result))
    })
    async_.parallel(tasks, function () {
        callback(result)
    })
}

/*
npm.load(() => {
    let source = new Map<string, string>()
    source.set('commander', '*')
    source.set("find-files-excluding-dirs", "alexsaveliev/find-files-excluding-dirs#hashtag")
    source.set("find-files-excluding-dirs-1", "alexsaveliev/find-files-excluding-dirs")
    source.set("google", "http://google.com")
    source.set("local", "/path/to/file")
    source.set("foo", "git://github.com/user/project.git#commit-ish")
    resolveAll(source, (dependencies: Map<string, Dependency>) => {
        console.log(dependencies)
        process.exit(0)
    })
})
*/
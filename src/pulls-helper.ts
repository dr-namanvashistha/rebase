import * as core from '@actions/core'
import {graphql} from '@octokit/graphql'
import {graphql as Graphql} from '@octokit/graphql/dist-types/types'
import * as OctokitTypes from '@octokit/types'
import {inspect} from 'util'

export class PullsHelper {
  graphqlClient: Graphql

  constructor(token: string) {
    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${token}`
      }
    })
  }

  async get(
    repository: string,
    head: string,
    headOwner: string,
    base: string
  ): Promise<Pull[]> {
    const [owner, repo] = repository.split('/')
    const params: OctokitTypes.RequestParameters = {
      owner: owner,
      repo: repo
    }
    if (head.length > 0) params.head = head
    if (base.length > 0) params.base = base
    const query = `query Pulls($owner: String!, $repo: String!, $head: String, $base: String) {
      repository(owner:$owner, name:$repo) {
        pullRequests(first: 100, states: OPEN, headRefName: $head, baseRefName: $base) {
          edges {
            node {
              baseRefName
              headRefName
              headRepository {
                nameWithOwner
                url
              }
              headRepositoryOwner {
                login
              }
              maintainerCanModify
            }
          }
        }
      }
    }`
    const pulls = await this.graphqlClient<Pulls>(query, params)
    core.debug(`Pulls: ${inspect(pulls.repository.pullRequests.edges)}`)

    const filteredPulls = pulls.repository.pullRequests.edges
      .map(p => {
        if (
          // Filter out pull requests where the head repo and/or branch has been deleted prematurely
          p.node.headRepository &&
          // Filter on head owner since the query only filters on head ref
          (headOwner.length == 0 ||
            p.node.headRepositoryOwner.login == headOwner) &&
          // Filter heads from forks where 'maintainer can modify' is false
          (p.node.headRepositoryOwner.login == owner ||
            p.node.maintainerCanModify)
        ) {
          return new Pull(
            p.node.baseRefName,
            p.node.headRepository.url,
            p.node.headRepository.nameWithOwner,
            p.node.headRefName
          )
        }
      })
      .filter(notUndefined)
    core.debug(`filteredPulls: ${inspect(filteredPulls)}`)

    return filteredPulls
  }
}

type Edge = {
  node: {
    baseRefName: string
    headRefName: string
    headRepository: {
      nameWithOwner: string
      url: string
    }
    headRepositoryOwner: {
      login: string
    }
    maintainerCanModify: boolean
  }
}

type Pulls = {
  repository: {
    pullRequests: {
      edges: Edge[]
    }
  }
}

export class Pull {
  baseRef: string
  headRepoUrl: string
  headRepoName: string
  headRef: string
  constructor(
    baseRef: string,
    headRepoUrl: string,
    headRepoName: string,
    headRef: string
  ) {
    this.baseRef = baseRef
    this.headRepoUrl = headRepoUrl
    this.headRepoName = headRepoName
    this.headRef = headRef
  }
}

function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined
}

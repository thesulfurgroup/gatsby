const { getPackages } = require(`@lerna/project`)
const PackageGraph = require(`@lerna/package-graph`)
const filterPackages = require(`@lerna/filter-packages`)
const util = require(`util`)
const path = require(`path`)
const { execFile, execFileSync } = require(`child_process`)

const execFileP = util.promisify(execFile)

const getPackagesWithReadWriteAccess = async user => {
  const { stdout } = await execFileP(`npm`, [`access`, `ls-packages`, user], {
    shell: false,
  })
  const permissions = JSON.parse(stdout)
  return Object.entries(permissions).reduce((lookup, [pkgName, access]) => {
    if (access === `read-write`) {
      lookup[pkgName] = pkgName
    }
    return lookup
  }, {})
}

module.exports = function getUnownedPackages({
  rootPath = path.join(__dirname, `../..`),
  user,
} = {}) {
  return getPackages(rootPath).then(async packages => {
    const graph = new PackageGraph(packages, `dependencies`, true)

    // filter out private packages
    // adding owner to private packages will fail, because package doesn't exist
    const publicGatsbyPackages = filterPackages(
      graph.rawPackageList,
      [],
      [],
      false
    )

    // infer user from npm whoami
    // set registry because yarn run hijacks registry
    if (!user) {
      user = await execFileP(
        `npm`,
        [`whoami`, `--registry`, `https://registry.npmjs.org`],
        { shell: false }
      )
        .then(({ stdout }) => stdout.trim())
        .catch(() => process.exit(1))
    }

    const alreadyOwnedPackages = await getPackagesWithReadWriteAccess(user)

    const publicGatsbyPackagesWithoutAccess = publicGatsbyPackages.filter(
      pkg => {
        if (alreadyOwnedPackages[pkg.name]) {
          return false
        }

        try {
          execFileSync(`npm`, [`view`, pkg.name, `version`], {
            stdio: `pipe`,
            shell: false,
          })
          return true
        } catch (e) {
          return false
        }
      }
    )

    return {
      packages: publicGatsbyPackagesWithoutAccess,
      user,
    }
  })
}

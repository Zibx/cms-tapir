const {declare} = require('@babel/helper-plugin-utils')

class BabelPluginExtractImportNames {
  constructor() {
    const state = this.state = []

    this.plugin = declare(api => {
      api.assertVersion(7)

      return {
        visitor: {
          ImportDeclaration(path) {
            const item = {};
            state.push(item);
            let added = false;
            path.traverse({
              Identifier(path) {
                if (path.key === 'local') {
                  item.name = path.node.name;

                }
              },
              Literal(path) {
                if (path.key === 'source') {
                  item.from = path.node.value;
                  item.fromLocation = path.node.loc;
                  item.nodeFrom = path.node;
                }
              }
            })
          }
        }
      }
    })
  }
}

module.exports = BabelPluginExtractImportNames
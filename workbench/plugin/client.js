window.__ModuleLoader__.load({
  id: "dsh-experience-workbench",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var h = React.createElement;

    function ExperienceIcon() {
      return h("div", {
        title: "项目经验库",
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          fontSize: "15px",
          fontWeight: 700,
          color: "var(--dsw-alias-label-secondary, #6b7280)",
        },
      }, "经");
    }

    function ExperiencePanel() {
      return h("iframe", {
        title: "项目经验库工作台",
        src: "/plugins/experience-workbench/",
        style: {
          width: "100%",
          height: "100%",
          border: "0",
          display: "block",
          background: "#f5f6f8",
        },
      });
    }

    function apply(ctx) {
      if (!ctx.slots) return;
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: "experience-workbench",
        order: 25,
        label: "经验库",
      }, ExperienceIcon));
      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main",
        key: "experience-workbench",
      }, ExperiencePanel));
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    exports.name = "dsh-experience-workbench";
    return module.exports;
  },
});

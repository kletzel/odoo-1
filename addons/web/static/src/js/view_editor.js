openerp.web.view_editor = function(openerp) {
var QWeb = openerp.web.qweb;
openerp.web.ViewEditor =   openerp.web.Widget.extend({
    init: function(parent, element_id, dataset, view, options) {
        this._super(parent);
        this.element_id = element_id
        this.parent = parent
        this.dataset = new openerp.web.DataSetSearch(this, 'ir.ui.view', null, null);
        this.model = dataset.model;
        this.xml_element_id = 0;
    },
    start: function() {
        this.init_view_editor();
    },
    init_view_editor: function() {
        var self = this;
        var action = {
            name: _.sprintf("Manage Views (%s)", this.model),
            context: this.session.user_context,
            domain: [["model", "=", this.model]],
            res_model: 'ir.ui.view',
            views: [[false, 'list']],
            type: 'ir.actions.act_window',
            target: "current",
            limit: this.dataset.limit || 80,
            auto_search: true,
            flags: {
                sidebar: false,
                deletable: false,
                views_switcher: false,
                action_buttons: false,
                search_view: false,
                pager: false,
                radio: true
            },
        };
        this.view_edit_dialog = new openerp.web.Dialog(this, {
            modal: true,
            title: 'ViewEditor',
            width: 750,
            height: 500,
            buttons: {
                "Create": function(){
                    //to do
                },
                "Edit": function(){
                    self.xml_element_id = 0;
                    self.get_arch();
                },
                "Close": function(){
                    self.view_edit_dialog.close();
                }
            },
        }).start().open();
        var action_manager = new openerp.web.ActionManager(this);
        action_manager.appendTo(this.view_edit_dialog);
        $.when(action_manager.do_action(action)).then(function() {
            var viewmanager = action_manager.inner_viewmanager,
                controller = viewmanager.views[viewmanager.active_view].controller;
            controller.on_loaded.add_last(function(){
                $(controller.groups).bind({
                    'selected': function(e, ids, records) {
                        self.main_view_id = ids[0];
                    }
                })
            });
        });
    },
    add_node_name : function(node) {
        if(node.tagName.toLowerCase() == "button" || node.tagName.toLowerCase() == "field"){
            return (node.getAttribute('name'))?
                _.sprintf( "<%s name='%s'>",node.tagName.toLowerCase(), node.getAttribute('name')):
                _.sprintf( "<%s>",node.tagName.toLowerCase());
        }else if(node.tagName.toLowerCase() == "group"){
            return (node.getAttribute('string'))?
                _.sprintf( "<%s>",node.getAttribute('string')):
                _.sprintf( "<%s>",node.tagName.toLowerCase());
        }else{
            return (node.getAttribute('string'))?
                _.sprintf( "<%s string='%s'>",node.tagName.toLowerCase(), node.getAttribute('string')):
                _.sprintf( "<%s>",node.tagName.toLowerCase());
        }
    },

    create_View_Node: function(node){
        var self = this;
        ViewNode = {
            'level': ($(node).parents()).length + 1,
            'id': self.xml_element_id += 1,
            'att_list': [],
            'name': self.add_node_name(node),
            'child_id': []
        }
        ViewNode.att_list.push(node.tagName.toLowerCase());
        _.each(node.attributes ,function(att){
           ViewNode.att_list.push([att.nodeName,att.nodeValue]);
       });
        return ViewNode;
    },

    append_child_object: function(main_object, parent_id, child_obj_list) {
        var self = this;
            if(main_object.id == parent_id){
                var pare
                main_object.child_id = child_obj_list;
                return main_object;
            }else{
                _.each(main_object.child_id ,function(child_object){
                    self.append_child_object(child_object, parent_id, child_obj_list);
                });
            }
    },

    convert_arch_to_obj: function(xml_Node, main_object, parent_id){
        var self = this;
        var child_obj_list = [];
        _.each(xml_Node,function(element){
           child_obj_list.push(self.create_View_Node(element)) ;
        });
        this.append_child_object(main_object, parent_id, child_obj_list);
        var obj_xml_list = _.zip(xml_Node,child_obj_list);
        _.each(obj_xml_list, function(node){
            if(node[0].children.length != 0){
            self.convert_arch_to_obj(node[0].children, main_object, node[1].id);}
        });
        return main_object;
    },

    parse_xml: function(arch, view_id) {
        main_object = {
            'level': 0,
            'id': this.xml_element_id +=1,
            'att_list': [],
            'name': _.sprintf("<view view_id = %s>", view_id),
            'child_id': []
        };
        var xml_arch = QWeb.load_xml(arch);
        return [this.convert_arch_to_obj(xml_arch.childNodes, main_object, this.xml_element_id)];
    },

    get_arch: function() {
        var self = this;
        var view_arch_list = [];
        this.dataset.read_ids([parseInt(self.main_view_id)], ['arch', 'type'], function(arch) {
            var arch_object = self.parse_xml(arch[0].arch, self.main_view_id);
            self.main_view_type = arch[0].type
            view_arch_list.push({"view_id": self.main_view_id, "arch": arch[0].arch});
            self.dataset.read_slice([], {domain: [['inherit_id','=', parseInt(self.main_view_id)]]}, function(result) {
                _.each(result, function(res) {
                    view_arch_list.push({"view_id": res.id, "arch": res.arch});
                    self.inherit_view(arch_object, res);
                });
                return self.edit_view({"main_object": arch_object,
                    "parent_child_id": self.parent_child_list(arch_object, []),
                    "arch": view_arch_list});
            });
        });
    },
    parent_child_list : function(one_object, parent_list) {
        var self = this;
        _.each(one_object , function(element) {
            if (element.child_id.length != 0) {
                parent_list.push({"key": element.id, "value": _.pluck(element.child_id, 'id')});
                self.parent_child_list(element.child_id, parent_list);
            }
        });
        return parent_list;
    },

    inherit_view : function(arch_object, result) {
        var self = this;
        var xml_list = [];
        var xml_arch = QWeb.load_xml(result.arch);
        (xml_arch.childNodes[0].tagName == "data")
            ? xml_list = xml_arch.childNodes[0].children 
                : xml_list.push(xml_arch.childNodes[0]);
        _.each(xml_list, function(xml) {
            var expr_to_list = [];
            var xpath_arch_object = self.parse_xml(QWeb.tools.xml_node_to_string(xml), result.id);
            if(xml.tagName == "xpath"){
                var part_expr = _.without(xml.getAttribute('expr').split("/"), "");
                _.each(part_expr, function(part) {
                    expr_to_list.push(_.without($.trim(part.replace(/[^a-zA-Z 0-9 _]+/g,'!')).split("!"), ""));
                });
            }else{
                var temp = _.reject(xpath_arch_object[0].child_id[0].att_list, function(list) {
                    return _.include(list, "position")
                });
                expr_to_list = [_.flatten(temp)];
            }
            self.inherit_apply(expr_to_list, arch_object ,xpath_arch_object);
        });
    },
    inherit_apply: function(expr_list ,arch_object ,xpath_arch_object) {
        var self = this;
        if (xpath_arch_object.length) {
            var check = expr_list[0];
            var obj;
            switch (check.length) {
                case 2:
                    if (parseInt(check[1])) {
                        //for field[3]
                        var temp_list = _.select(arch_object, function(element) {
                            return _.include(_.flatten(element.att_list), check[0]);
                        });
                        obj = arch_object[_.indexOf(arch_object, temp_list[parseInt(check[1]) - 1])];
                    } else {
                        //for notebook[last()]
                        obj = _.detect(arch_object, function(element) {
                            return _.include(_.flatten(element.att_list), check[0]);
                        });
                    }
                    break;
                case 3:
                    //for field[@name='type']
                    obj = _.detect(arch_object, function(element){
                        if ((_.intersection(_.flatten(element.att_list), _.uniq(check))).length == check.length) {
                            return element;
                        }
                    });
                    break;
                case 1:
                    //for /form/notebook
                    var temp_list = _.select(arch_object, function(element) {
                        return _.include(_.flatten(element.att_list), check[0]);
                    });
                    if (temp_list.length != 0) {
                        expr_list.length == 1 ? obj = temp_list[0] : expr_list.shift();
                    }
                    break;
            }
            if (obj) {
                expr_list.shift();
                if (expr_list.length) {
                    self.inherit_apply(expr_list, obj.child_id, xpath_arch_object);
                } else {
                    self.increase_level(xpath_arch_object[0], obj.level + 1);
                    obj.child_id.push(xpath_arch_object[0]);
                    xpath_arch_object.pop();
                }
            }
            else {
                _.each(arch_object, function(element) {
                    self.inherit_apply(expr_list, element.child_id, xpath_arch_object);
                });
            }
        }
    },
    increase_level: function(val, level) {
        var self = this;
        val.level = level;
        _.each(val.child_id, function(val, key) {
            self.increase_level(val, level + 1);
        });
    },
    edit_view: function(one_object) {
        var self = this;
        this.edit_xml_dialog = new openerp.web.Dialog(this, {
            modal: true,
            title: _.sprintf("View Editor %d - %s", self.main_view_id, self.model),
            width: 750,
            height: 500,
            buttons: {
                "Inherited View": function() {
                    //todo
                },
                "Preview": function() {
                    var action = {
                        context: self.session.user_context,
                        res_model: self.model,
                        views: [[self.main_view_id, self.main_view_type]],
                        type: 'ir.actions.act_window',
                        target: "new",
                        flags: {
                            sidebar: false,
                            views_switcher: false,
                            action_buttons: false,
                            search_view: false,
                            pager: false,
                        },
                    };
                    var action_manager = new openerp.web.ActionManager(self);
                    action_manager.do_action(action);
                },
                "Close": function(){
                    self.edit_xml_dialog.close();
                }
            }
        }).start().open();
        this.edit_xml_dialog.$element.html(QWeb.render('view_editor', {'data': one_object['main_object']}));
        this.edit_xml_dialog.$element.find("tr[id^='viewedit-']").click(function() {
            self.edit_xml_dialog.$element.find("tr[id^='viewedit-']").removeClass('ui-selected');
            $(this).addClass('ui-selected');
        });
        this.edit_xml_dialog.$element.find("img[id^='parentimg-']").click(function() {
            if ($(this).attr('src') == '/web/static/src/img/collapse.gif') {
                $(this).attr('src', '/web/static/src/img/expand.gif');
                self.on_expand(this);
            } else {
                $(this).attr('src', '/web/static/src/img/collapse.gif');
                var id = this.id.split('-')[1];
                self.on_collapse(this,one_object['parent_child_id'], one_object['main_object']);
            }
        });
        this.edit_xml_dialog.$element.find("img[id^='side-']").click(function() {
            var side = $(this).closest("tr[id^='viewedit-']");
            var clicked_tr_id = (side.attr('id')).split('-')[1];
            var img = side.find("img[id='parentimg-" + clicked_tr_id + "']").attr('src');
            var clicked_tr_level = parseInt(side.attr('level'));
            var cur_tr = side;
            var last_tr;
            var next_tr;
            var tr_to_move = [];
            tr_to_move.push(side);
            var view_id;
            var view_xml_id;
            var view_find = side;
            while (1) {
                view_find = view_find.prev();
                if((self.edit_xml_dialog.$element.find(view_find).find('a').text()).search("view_id") != -1
                        && parseInt(view_find.attr('level')) < clicked_tr_level) {
                    view_id = parseInt(($(view_find).find('a').text()).replace(/[^0-9]+/g, ''));
                    view_xml_id = (view_find.attr('id')).split('-')[1];
                    break;
                }
            }
            switch (this.id) {
                case "side-add":
                    break;
                case "side-remove":
                    break;
                case "side-edit":
                    break;
                case "side-up":
                    while (1) {
                        var prev_tr = cur_tr.prev();
                        if (clicked_tr_level >= parseInt(prev_tr.attr('level')) || prev_tr.length == 0) {
                           last_tr = prev_tr;
                           break;
                        }
                        cur_tr = prev_tr;
                    }
                    if (img) {
                    self.edit_xml_dialog.$element.find("img[id='parentimg-" + clicked_tr_id + "']").
                            attr('src', '/web/static/src/img/expand.gif');
                        while (1) {
                            next_tr = side.next();
                            if (parseInt(next_tr.attr('level')) <= clicked_tr_level || next_tr.length == 0) {
                                break;
                            } else {
                                next_tr.hide();
                                tr_to_move.push(next_tr);
                                side = next_tr;
                            }
                        }
                    }
                    if (last_tr.length != 0 && parseInt(last_tr.attr('level')) == clicked_tr_level &&
                            (self.edit_xml_dialog.$element.find(last_tr).find('a').text()).search("view_id") == -1) {
                        _.each(tr_to_move, function(rec) {
                             $(last_tr).before(rec);
                        });
                        self.save_move_arch(one_object, view_id, view_xml_id, clicked_tr_id, clicked_tr_level, "up");
                    }
                break;
            case "side-down":
                if (img) {
                    while (1) {
                        next_tr = cur_tr.next();
                        if ( parseInt(next_tr.attr('level')) <= clicked_tr_level || next_tr.length == 0) {
                            last_tr = next_tr;
                            break;
                        } else {
                            tr_to_move.push(next_tr);
                            cur_tr = next_tr;
                        }
                   }
                }
                else {
                    last_tr = cur_tr.next();
                }
                if ((self.edit_xml_dialog.$element.find(last_tr).find('a').text()).search("view_id") != -1) {
                    return;
                }
                if (last_tr.length != 0 &&  parseInt(last_tr.attr('level')) == clicked_tr_level) {
                    var last_tr_id = (last_tr.attr('id')).split('-')[1];
                    img = last_tr.find("img[id='parentimg-" + last_tr_id + "']").attr('src');
                    if (img) {
                        self.edit_xml_dialog.$element.find("img[id='parentimg-" + last_tr_id + "']").
                                                        attr('src', '/web/static/src/img/expand.gif');
                        while (1) {
                            var next_tr = last_tr.next();
                            if (next_tr.attr('level') <= clicked_tr_level || next_tr.length == 0) break;
                            next_tr.hide();
                            last_tr = next_tr;
                        }
                    }
                    tr_to_move.reverse();
                    _.each(tr_to_move, function(rec) {
                       $(last_tr).after(rec);
                    });
                    self.save_move_arch(one_object, view_id, view_xml_id, clicked_tr_id, clicked_tr_level, "down");
                }
                break;
            }
        });
    },
    save_move_arch: function(one_object, view_id, view_xml_id, clicked_tr_id, level, move_direct) {
        var self = this;
        var arch = _.detect(one_object['arch'], function(element) {return element.view_id == view_id;});
        var obj = self.get_object_by_id(view_xml_id, one_object['main_object'], []);
         //for finding xpath tag from inherit view
        var xml_arch = QWeb.load_xml(arch.arch);
        if (xml_arch.childNodes[0].tagName == "data") {
            var check_list = _.flatten(obj[0].child_id[0].att_list);
            arch.arch = _.detect(xml_arch.childNodes[0].children, function(xml_child){
                var temp_obj = self.create_View_Node(xml_child);
                var insert = _.intersection(_.flatten(temp_obj.att_list),_.uniq(check_list));
                if (insert.length == check_list.length ) {return xml_child;}
            });
        }
        return self.save_arch(arch.arch, obj[0].child_id[0], parseInt(clicked_tr_id), [], parseInt(level),
                        parseInt(view_id), arch, move_direct);
    },

    get_object_by_id: function(view_xml_id, one_object, result) {
        var self = this;
        if (result.length == 0 ) {
            var check = _.detect(one_object , function(obj) {
                return view_xml_id == obj.id;
            });
            if (check) {result.push(check);};
            _.each(one_object, function(obj) {
               self.get_object_by_id(view_xml_id, obj.child_id, result);
            });
        }
        return result;
    },

    save_arch: function(arch1, obj, id, child_list, level, view_id, arch, move_direct){
        var self = this;
        var children_list =  $(arch1).children();
        var list_obj_xml = _.zip(children_list,obj.child_id);
        if (id) {
            if (obj.id == id) {
                var id;
                var parent = $(arch1).parents();
                var index = _.indexOf(child_list, obj);
                var re_insert_obj = child_list.splice(index, 1);
                if (move_direct == "down") {
                    var next = $(arch1).next();
                    $(next).after(arch1);
                    child_list.splice(index+1, 0, re_insert_obj[0]);
                } else {
                    var prev = $(arch1).prev();
                    $(prev).before(arch1);
                    child_list.splice(index-1, 0, re_insert_obj[0]);
                }
                var convert_to_utf = QWeb.tools.xml_node_to_string(parent[parent.length-1]);
                convert_to_utf = convert_to_utf.replace('xmlns="http://www.w3.org/1999/xhtml"', "");
                convert_to_utf = '<?xml version="1.0"?>' + convert_to_utf;
                arch.arch = convert_to_utf;
                this.dataset.write(parseInt(view_id),{"arch":convert_to_utf}, function(r) {
                });
            }
            if (obj.level <= level) {
                _.each(list_obj_xml, function(child_node) {
                    self.save_arch(child_node[0], child_node[1], id, obj.child_id, level, view_id, arch, move_direct);
                });
            }
        }
    }, 
    on_expand: function(expand_img){
        var level = parseInt($(expand_img).closest("tr[id^='viewedit-']").attr('level'));
        var cur_tr = $(expand_img).closest("tr[id^='viewedit-']");
        while (1) {
            var nxt_tr = cur_tr.next();
            if (parseInt(nxt_tr.attr('level')) > level) {
                cur_tr = nxt_tr;
                nxt_tr.hide();
            } else return nxt_tr;
        }
    },
    on_collapse: function(collapse_img, parent_child_id, id, main_object) {
        var self = this;
        var id = collapse_img.id.split('-')[1];
        var datas = _.detect(parent_child_id, function(res) {
            return res.key == id;
        });
        _.each(datas.value, function (rec) {
            var tr = self.edit_xml_dialog.$element.find("tr[id='viewedit-" + rec + "']");
            tr.find("img[id='parentimg-" + rec + "']").attr('src', '/web/static/src/img/expand.gif');
            tr.show();
        });
    }
});
};

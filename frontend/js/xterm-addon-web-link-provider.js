var WebLinkProvider = (function () {
    function WebLinkProvider(_terminal, _regex, _handler, _options) {
        if (_options === void 0) { _options = {}; }
        this._terminal = _terminal;
        this._regex = _regex;
        this._handler = _handler;
        this._options = _options;
    }
    WebLinkProvider.prototype.provideLinks = function (y, callback) {
        var links = LinkComputer.computeLink(y, this._regex, this._terminal, this._handler);
        callback(this._addCallbacks(links));
    };
    WebLinkProvider.prototype._addCallbacks = function (links) {
        var _this = this;
        return links.map(function (link) {
            link.leave = _this._options.leave;
            link.hover = function (event, uri) {
                if (_this._options.hover) {
                    var range = link.range;
                    _this._options.hover(event, uri, range);
                }
            };
            return link;
        });
    };
    return WebLinkProvider;
}());
var LinkComputer = (function () {
    function LinkComputer() {
    }
    LinkComputer.computeLink = function (y, regex, terminal, activate) {
        var rex = new RegExp(regex.source, (regex.flags || '') + 'g');
        var _a = LinkComputer._translateBufferLineToStringWithWrap(y - 1, false, terminal), line = _a[0], startLineIndex = _a[1];
        var match;
        var stringIndex = -1;
        var result = [];
        while ((match = rex.exec(line)) !== null) {
            var text = match[1];
            if (!text) {
                console.log('match found without corresponding matchIndex');
                break;
            }
            stringIndex = line.indexOf(text, stringIndex + 1);
            rex.lastIndex = stringIndex + text.length;
            if (stringIndex < 0) {
                break;
            }
            var endX = stringIndex + text.length;
            var endY = startLineIndex + 1;
            while (endX > terminal.cols) {
                endX -= terminal.cols;
                endY++;
            }
            var range = {
                start: {
                    x: stringIndex + 1,
                    y: startLineIndex + 1
                },
                end: {
                    x: endX,
                    y: endY
                }
            };
            result.push({ range: range, text: text, activate: activate });
        }
        return result;
    };
    LinkComputer._translateBufferLineToStringWithWrap = function (lineIndex, trimRight, terminal) {
        var lineString = '';
        var lineWrapsToNext;
        var prevLinesToWrap;
        do {
            var line = terminal.buffer.active.getLine(lineIndex);
            if (!line) {
                break;
            }
            if (line.isWrapped) {
                lineIndex--;
            }
            prevLinesToWrap = line.isWrapped;
        } while (prevLinesToWrap);
        var startLineIndex = lineIndex;
        do {
            var nextLine = terminal.buffer.active.getLine(lineIndex + 1);
            lineWrapsToNext = nextLine ? nextLine.isWrapped : false;
            var line = terminal.buffer.active.getLine(lineIndex);
            if (!line) {
                break;
            }
            lineString += line.translateToString(!lineWrapsToNext && trimRight).substring(0, terminal.cols);
            lineIndex++;
        } while (lineWrapsToNext);
        return [lineString, startLineIndex];
    };
    return LinkComputer;
}());

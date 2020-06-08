import  _ from 'lodash';

/**
 * Webcam Directive
 *
 * (c) Jonas Hartmann http://jonashartmann.github.io/webcam-directive
 * License: MIT
 *
 * @version: 3.2.1
 */
'use strict';

(function() {
  // GetUserMedia is not yet supported by all browsers
  // Until then, we need to handle the vendor prefixes
  navigator.getMedia = ( navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia);

  // Latest specs modified how to access it
  window.hasModernUserMedia = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  if (window.hasModernUserMedia) {
    navigator.getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  }

  // Checks if feature support is available on the client browser
  window.hasUserMedia = function hasUserMedia() {
    return !!navigator.getMedia;
  };
})();

angular.module('webcam', [])
  .directive('webcam', function () {
    return {
      template: '<div class="webcam" ng-transclude></div>',
      restrict: 'E',
      replace: true,
      transclude: true,
      scope:
        {
          onError: '&',
          onStream: '&',
          onStreams: '&',
          onStreaming: '&',
          placeholder: '=',
          facing: '<', // 'environment' | 'user' | 'left' | 'right'
          config: '=channel'
        },
      link: function postLink($scope, element) {
        var videoElem = null,
          videoStream = null,
          placeholder = null;

        $scope.config = $scope.config || {};

        var _removeDOMElement = function _removeDOMElement(DOMel) {
          if (DOMel) {
            angular.element(DOMel).remove();
          }
        };

        var onDestroy = function onDestroy() {
          if (!!videoStream ) {
            var checker = typeof videoStream.getVideoTracks === 'function';
            if(videoStream.getVideoTracks && checker) {
              // get video track to call stop in it
              // videoStream.stop() is deprecated and may be removed in the
              // near future
              // ENSURE THIS IS CHECKED FIRST BEFORE THE FALLBACK
              // videoStream.stop()
              var tracks = videoStream.getVideoTracks();
              if (tracks && tracks[0] && tracks[0].stop) {
                tracks[0].stop();
              }
            } else if (videoStream.stop) {
              // deprecated, may be removed in the near future
              videoStream.stop();
            }
          }

          if (!!videoElem) {
            delete videoElem.src;
            delete videoElem.srcObject;
            videoElem.removeAttribute('src');
            videoElem.removeAttribute('srcObject');
          }
        };

        // called when camera stream is loaded
        var onSuccess = function onSuccess(medias) {
          // first filter out any webcams that don't point in the desired direction
          if (
            $scope.config.mediaConstraint
            && $scope.config.mediaConstraint.video
            && $scope.config.mediaConstraint.video.facing
            && !_.some(medias, (media)=>{
              return media.capabilities.facingMode === $scope.config.mediaConstraint.video.facing;
            })
          ) {
            medias = _.filter(medias, (media)=>{
              return !media.capabilities.facingMode.length || media.capabilities.facingMode === $scope.config.mediaConstraint.video.facing;
            });
          }

          medias = _.sortBy(medias, (media)=>media.capabilities.width);
          let highestStream = medias[0].stream; // highest possible resolution
          let highestCapabilities = medias[0].capabilities;
          let lowestStream = medias[medias.length - 1].stream; // lowest possible resolution
          videoStream = highestStream;

          if (window.hasModernUserMedia) {
            videoElem.srcObject = highestStream;
          } else if (navigator.mozGetUserMedia) {
            // Firefox supports a src object
            videoElem.mozSrcObject = highestStream;
          } else {
            var vendorURL = window.URL || window.webkitURL;
            videoElem.src = vendorURL.createObjectURL(highestStream);
          }

          /* Start playing the video to show the stream from the webcam */
          videoElem.play();
          $scope.config.video = videoElem;

          /* Call custom callback */
          if ($scope.onStream) {
            $scope.onStream({ stream: highestStream, capabilities: highestCapabilities });
          }
          if ($scope.onStreams) {

            $scope.onStreams({ streams: medias });
          }
        };

        // called when any error happens
        var onFailure = function onFailure(err) {
          _removeDOMElement(placeholder);
          if (console && console.debug) {
            console.debug('The following error occured: ', err);
          }

          /* Call custom callback */
          if ($scope.onError) {
            $scope.onError({err: err});
          }
        };

        var startWebcam = async function startWebcam() {
          videoElem = document.createElement('video');
          videoElem.setAttribute('class', 'webcam-live');
          videoElem.setAttribute('autoplay', '');
          element.append(videoElem);

          if ($scope.placeholder) {
            placeholder = document.createElement('img');
            placeholder.setAttribute('class', 'webcam-loader');
            placeholder.src = $scope.placeholder;
            element.append(placeholder);
          }

          // Default variables
          var isStreaming = false,
            width = element.width = $scope.config.videoWidth || 320,
            height = element.height = 0;

          // Check the availability of getUserMedia across supported browsers
          if (!window.hasUserMedia()) {
            onFailure({ code: -1, msg: 'Browser does not support getUserMedia.' });
            return;
          }

          // var mediaConstraint = {
          //     video: true,
          //     audio: false
          // };
          // var mediaConstraintOverrides = $scope.config.mediaConstraint;
          // if (mediaConstraintOverrides) {
          //     // merge (vanilla js)
          //     for (var prop in mediaConstraintOverrides) {
          //         if (mediaConstraintOverrides.hasOwnProperty(prop)) {
          //             mediaConstraint[prop] = mediaConstraintOverrides[prop];
          //         }
          //     }
          // }

          // find the best resolution
          const qvga =   { video: {width: {exact: 320},  height: {exact: 240}}   };
          const vga =    { video: {width: {exact: 640},  height: {exact: 480}}   };
          const hd =     { video: {width: {exact: 1280}, height: {exact: 720}}   }; // 720p (1MP)
          const fullHd = { video: {width: {exact: 1920}, height: {exact: 1080}}  }; // 1080p (2MP)
          const _3mp =   { video: {width: {exact: 2048}, height: {exact: 1536}}  }; // 3MP
          const _4mp =   { video: {width: {exact: 2688}, height: {exact: 1520}}  }; // 2K
          const _5mp =   { video: {width: {exact: 2592}, height: {exact: 1944}}  }; // Microsoft Life Cam (Front)
          const _6mp =   { video: {width: {exact: 3072}, height: {exact: 2048}}  }; // 6MP
          const _8mp =   { video: {width: {exact: 3840}, height: {exact: 2160}}  }; // Microsoft Life Cam (Rear) - UHD
          const fourK =  { video: {width: {exact: 4096}, height: {exact: 2160}}  };
          const eightK = { video: {width: {exact: 7680}, height: {exact: 4320}}  };
          let testableResoutions = [qvga, vga, hd, fullHd, _3mp, _4mp, _5mp, _6mp, _8mp, fourK, eightK];
          let mediaConstraintOverrides = $scope.config.mediaConstraint;
          if (mediaConstraintOverrides) {
            _.forEach(testableResoutions, (testableResolution, index)=>{
              testableResolution = _.merge(testableResolution, mediaConstraintOverrides);
              testableResolution.audio = false;
            });
          }
          let availableStreams = [];
          let promises = [];

          // stick with the highest resolution
          _.forEach(testableResoutions, _constraint => {
            // if (!highest) {
            try {
              if (window.hasModernUserMedia) {
                // The spec has changed towards a Promise based interface
                promises.push(
                  navigator.getMedia(_constraint)
                    .then(function(media){
                      availableStreams.push({
                        width: _constraint.video.width.exact,
                        stream: media,
                        capabilities: media.getTracks()[0] && media.getTracks()[0].getCapabilities()
                      });
                    })
                    .catch((ignore)=>{})
                );
              } else {
                navigator.getMedia(_constraint, onSuccess, onFailure);
              }
            } catch (ignore) {}

          });
          Promise.all(promises).then(()=>{
            if (availableStreams.length) {
              onSuccess(availableStreams);
            } else {
              onFailure(new Error('no streams could be established for a webcam'));
            }
          });

          /* Start streaming the webcam data when the video element can play
           * It will do it only once
           */
          videoElem.addEventListener('canplay', function() {
            if (!isStreaming) {
              var scale = width / videoElem.videoWidth;
              height = (videoElem.videoHeight * scale) ||
                $scope.config.videoHeight;
              videoElem.setAttribute('width', width);
              videoElem.setAttribute('height', height);
              isStreaming = true;

              $scope.config.video = videoElem;

              _removeDOMElement(placeholder);

              /* Call custom callback */
              if ($scope.onStreaming) {
                $scope.onStreaming();
              }
            }
          }, false);
        };

        var stopWebcam = function stopWebcam() {
          onDestroy();
          videoElem.remove();
        };

        $scope.$on('$destroy', onDestroy);
        $scope.$on('START_WEBCAM', startWebcam);
        $scope.$on('STOP_WEBCAM', stopWebcam);

        startWebcam();

      }
    };
  });

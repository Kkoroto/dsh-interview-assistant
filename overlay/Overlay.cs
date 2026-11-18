using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Threading.Tasks;
using System.Windows.Threading;
using System.Web.Script.Serialization;
using Drawing = System.Drawing;
using DrawingImaging = System.Drawing.Imaging;
using Forms = System.Windows.Forms;

namespace LiveCaption
{
    public sealed class RubyToken
    {
        public string T;
        public string R;
    }

    public sealed class ExtraCard
    {
        public string Label;
        public string Content;
        public string Tone;
    }

    public sealed class CaptionItem
    {
        public string Id;
        public string SpeakerLabel;
        public string Language;
        public string Time;
        public string Text;
        public string Translation;
        public string TranslationState; // null | "pending" | "failed"
        public Color Accent = Color.FromRgb(0x5B, 0x8D, 0xEF);
        public List<ExtraCard> Extras = new List<ExtraCard>();
        public List<RubyToken> Ruby = new List<RubyToken>();
    }

    public sealed class AnalysisCard
    {
        public string Id;
        public string Label;
        public string Content;
        public string Time;
        public bool Hidden;
        public string Language;
        public List<List<RubyToken>> RubyLines = new List<List<RubyToken>>();
        public string Translation;
    }

    public static class Program
    {
        internal static readonly bool Debug = Environment.GetEnvironmentVariable("LC_OVERLAY_DEBUG") == "1";

        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                Console.InputEncoding = new UTF8Encoding(false);
                Console.OutputEncoding = new UTF8Encoding(false);
            }
            catch (Exception) { }
            var app = new Application();
            app.ShutdownMode = ShutdownMode.OnMainWindowClose;
            var shell = new OverlayShell();
            app.Run(shell.Window);
        }
    }

    public sealed class OverlayShell
    {
        private readonly Window _win;
        private readonly Border _root;
        private readonly StackPanel _panel;
        private readonly ScrollViewer _scroll;
        private readonly TextBlock _title;
        private readonly TextBlock _status;
        private readonly TextBlock _count;
        private readonly Slider _opacity;
        private readonly Button _viewButton;
        private readonly Button _analyzeButton;
        private readonly Thumb _grip;
        private readonly DispatcherTimer _paint;
        private readonly Dictionary<string, CaptionItem> _items = new Dictionary<string, CaptionItem>();
        private readonly List<string> _order = new List<string>();
        private readonly List<AnalysisCard> _analyses = new List<AnalysisCard>();
        private readonly Dictionary<string, Border> _cards = new Dictionary<string, Border>();
        private readonly Dictionary<string, Border> _groupHeaders = new Dictionary<string, Border>();
        private string _lastAddedId;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();
        private bool _dirty;
        private bool _grouped = true;
        private bool _allowClose;
        private bool _analysisPending;
        private DispatcherTimer _analysisTimer;
        private string _titleText = "面试助手";
        private int _fontSize = 14;
        private bool _allHidden;
        private bool _rightDown;
        private bool _rightLongTriggered;
        private bool _rightClickPending;
        private DispatcherTimer _rightLongTimer;
        private DispatcherTimer _rightClickTimer;
        private bool _leftDown;
        private bool _leftLongTriggered;
        private bool _leftClickPending;
        private DispatcherTimer _leftLongTimer;
        private DispatcherTimer _leftClickTimer;
        private bool _longMode;
        private Window _selector;
        private bool _selectorDragging;
        private Point _selectorStart;
        private Border _selectorRect;

        private static readonly Color[] Palette = new Color[]
        {
            Color.FromRgb(0x5B, 0x8D, 0xEF),
            Color.FromRgb(0xF5, 0x9E, 0x0B),
            Color.FromRgb(0x34, 0xD3, 0x99),
            Color.FromRgb(0xA7, 0x8B, 0xFA),
            Color.FromRgb(0xF4, 0x72, 0xB6),
            Color.FromRgb(0x22, 0xD3, 0xEE)
        };

        public Window Window
        {
            get { return _win; }
        }

        public OverlayShell()
        {
            _win = new Window();
            _json.MaxJsonLength = 32 * 1024 * 1024;
            _win.WindowStyle = WindowStyle.None;
            _win.AllowsTransparency = true;
            _win.Background = Brushes.Transparent;
            _win.Topmost = true;
            _win.ShowInTaskbar = false;
            _win.ResizeMode = ResizeMode.NoResize;
            _win.ShowActivated = false;
            _win.Focusable = true;
            _win.Width = 520;
            _win.Height = 340;
            _win.Opacity = 0.95;
            _win.FontFamily = new FontFamily("Microsoft YaHei UI, Yu Gothic UI, Segoe UI");
            _win.Title = "DSH Interview Assistant";

            Rect area = SystemParameters.WorkArea;
            _win.Left = Math.Max(area.Left + 8, area.Right - _win.Width - 24);
            _win.Top = area.Top + 24;

            _root = new Border();
            _root.CornerRadius = new CornerRadius(14);
            _root.Background = new SolidColorBrush(Color.FromArgb(0xF2, 20, 22, 28));
            _root.BorderBrush = new SolidColorBrush(Color.FromArgb(0x55, 255, 255, 255));
            _root.BorderThickness = new Thickness(1);
            _root.Effect = new DropShadowEffect { BlurRadius = 20, ShadowDepth = 0, Opacity = 0.5 };

            var grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            // Header
            var header = new Border();
            header.Background = new SolidColorBrush(Color.FromArgb(0x33, 255, 255, 255));
            header.CornerRadius = new CornerRadius(14, 14, 0, 0);
            header.Padding = new Thickness(12, 7, 8, 7);
            var head = new Grid();
            head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            _title = new TextBlock();
            _title.Text = _titleText;
            _title.Foreground = Brushes.White;
            _title.FontSize = 13;
            _title.FontWeight = FontWeights.SemiBold;
            _title.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(_title, 0);
            head.Children.Add(_title);

            var controls = new StackPanel();
            controls.Orientation = Orientation.Horizontal;
            controls.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(controls, 1);

            _analyzeButton = MakeIconButton("AI 作答");
            _analyzeButton.ToolTip = "根据最近面试对话生成一次作答（长按或双击 →）";
            _analyzeButton.Click += delegate
            {
                TriggerAnalyze(false);
            };
            controls.Children.Add(_analyzeButton);

            var hide = MakeIconButton("—");
            hide.ToolTip = "隐藏悬浮窗（监听继续）";
            hide.Click += delegate
            {
                _win.Hide();
                WriteLine("{\"op\":\"hidden\"}");
            };
            controls.Children.Add(hide);

            var close = MakeIconButton("×");
            close.ToolTip = "隐藏悬浮窗（监听继续，用右侧栏「结束」停止）";
            close.Click += delegate
            {
                _win.Hide();
                WriteLine("{\"op\":\"hidden\"}");
            };
            controls.Children.Add(close);
            head.Children.Add(controls);

            var subControls = new StackPanel();
            subControls.Orientation = Orientation.Horizontal;
            subControls.VerticalAlignment = VerticalAlignment.Center;
            subControls.Margin = new Thickness(0, 5, 0, 0);
            var minus = MakeIconButton("A-");
            minus.ToolTip = "缩小正文字号";
            minus.Click += delegate { AdjustFont(-1); };
            subControls.Children.Add(minus);
            var plus = MakeIconButton("A+");
            plus.ToolTip = "放大正文字号";
            plus.Click += delegate { AdjustFont(1); };
            subControls.Children.Add(plus);
            var shot = MakeIconButton("AI截图答题");
            shot.ToolTip = "AI 截图答题：拖拽框选屏幕区域（快捷键 ←）";
            shot.Click += delegate { StartRegionCapture(); };
            subControls.Children.Add(shot);
            _viewButton = MakeIconButton("分组");
            _viewButton.ToolTip = "切换「按说话人/语言分组」与「时间线」";
            _viewButton.Click += delegate
            {
                _grouped = !_grouped;
                _viewButton.Content = _grouped ? "分组" : "时间线";
                _dirty = true;
                PaintNow();
            };
            subControls.Children.Add(_viewButton);

            var opacityLabel = new TextBlock();
            opacityLabel.Text = "透明";
            opacityLabel.Foreground = new SolidColorBrush(Color.FromArgb(0xAA, 255, 255, 255));
            opacityLabel.FontSize = Fs(10);
            opacityLabel.VerticalAlignment = VerticalAlignment.Center;
            opacityLabel.Margin = new Thickness(10, 0, 5, 0);
            subControls.Children.Add(opacityLabel);

            _opacity = new Slider();
            _opacity.Minimum = 0.3;
            _opacity.Maximum = 1.0;
            _opacity.Value = 0.95;
            _opacity.Width = 100;
            _opacity.VerticalAlignment = VerticalAlignment.Center;
            _opacity.ToolTip = "透明度（Ctrl + 滚轮）";
            _opacity.ValueChanged += delegate
            {
                _win.Opacity = _opacity.Value;
            };
            subControls.Children.Add(_opacity);

            var headerStack = new StackPanel();
            headerStack.Children.Add(head);
            headerStack.Children.Add(subControls);
            header.Child = headerStack;
            header.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState != MouseButtonState.Pressed) return;
                if (FindAncestor<Button>(e.OriginalSource as DependencyObject) != null) return;
                if (FindAncestor<Slider>(e.OriginalSource as DependencyObject) != null) return;
                try { _win.DragMove(); }
                catch (Exception) { }
            };
            Grid.SetRow(header, 0);
            grid.Children.Add(header);

            // Content
            _panel = new StackPanel();
            _panel.Margin = new Thickness(14, 10, 14, 10);
            _scroll = new ScrollViewer();
            _scroll.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            _scroll.HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled;
            _scroll.Content = _panel;
            _scroll.CanContentScroll = false;
            Grid.SetRow(_scroll, 1);
            grid.Children.Add(_scroll);

            // Footer
            var footer = new Border();
            footer.Background = new SolidColorBrush(Color.FromArgb(0x22, 0, 0, 0));
            footer.CornerRadius = new CornerRadius(0, 0, 14, 14);
            footer.Padding = new Thickness(12, 5, 12, 6);
            var foot = new Grid();
            foot.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            foot.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            _status = new TextBlock();
            _status.Text = "准备就绪";
            _status.FontSize = 11;
            _status.Foreground = new SolidColorBrush(Color.FromArgb(0xB0, 255, 255, 255));
            _status.TextTrimming = TextTrimming.CharacterEllipsis;
            Grid.SetColumn(_status, 0);
            foot.Children.Add(_status);
            _count = new TextBlock();
            _count.Text = "";
            _count.FontSize = 11;
            _count.Foreground = new SolidColorBrush(Color.FromArgb(0x88, 255, 255, 255));
            _count.Margin = new Thickness(10, 0, 0, 0);
            Grid.SetColumn(_count, 1);
            foot.Children.Add(_count);
            footer.Child = foot;
            Grid.SetRow(footer, 2);
            grid.Children.Add(footer);

            _root.Child = grid;

            var outer = new Grid();
            outer.Children.Add(_root);

            _grip = new Thumb();
            _grip.Width = 18;
            _grip.Height = 18;
            _grip.HorizontalAlignment = HorizontalAlignment.Right;
            _grip.VerticalAlignment = VerticalAlignment.Bottom;
            _grip.Cursor = Cursors.SizeNWSE;
            _grip.Background = Brushes.Transparent;
            _grip.ToolTip = "拖动调整大小";
            _grip.DragDelta += delegate(object sender, DragDeltaEventArgs e)
            {
                _win.Width = Math.Max(360, _win.Width + e.HorizontalChange);
                _win.Height = Math.Max(220, _win.Height + e.VerticalChange);
            };
            Panel.SetZIndex(_grip, 50);
            outer.Children.Add(_grip);

            _win.Content = outer;
            _win.PreviewMouseLeftButtonDown += delegate
            {
                _win.Activate();
                _win.Focus();
            };
            _win.MouseWheel += delegate(object sender, MouseWheelEventArgs e)
            {
                if ((Keyboard.Modifiers & ModifierKeys.Control) == 0) return;
                double next = _win.Opacity + (e.Delta > 0 ? 0.05 : -0.05);
                _opacity.Value = Math.Max(0.3, Math.Min(1.0, next));
            };
            _win.PreviewKeyDown += delegate(object sender, KeyEventArgs e)
            {
                if (Keyboard.Modifiers != ModifierKeys.None) return;
                if (Keyboard.FocusedElement is Slider) return;
                if (e.Key == Key.Right)
                {
                    OnRightDown();
                    e.Handled = true;
                }
                else if (e.Key == Key.Left)
                {
                    OnLeftDown();
                    e.Handled = true;
                }
            };
            _win.PreviewKeyUp += delegate(object sender, KeyEventArgs e)
            {
                if (e.Key == Key.Right)
                {
                    OnRightUp();
                    e.Handled = true;
                }
                else if (e.Key == Key.Left)
                {
                    OnLeftUp();
                    e.Handled = true;
                }
            };
            _win.LostKeyboardFocus += delegate
            {
                CancelArrowState();
            };
            _win.Loaded += delegate
            {
                WriteLine("{\"op\":\"window-ready\"}");
            };
            _win.Closing += delegate(object sender, System.ComponentModel.CancelEventArgs e)
            {
                if (!_allowClose)
                {
                    e.Cancel = true;
                    _win.Hide();
                    WriteLine("{\"op\":\"hidden\"}");
                }
            };

            _paint = new DispatcherTimer();
            _paint.Interval = TimeSpan.FromMilliseconds(120);
            _paint.Tick += delegate
            {
                if (!_dirty) return;
                PaintNow();
            };
            _paint.Start();

            _analysisTimer = new DispatcherTimer();
            _analysisTimer.Interval = TimeSpan.FromSeconds(30);
            _analysisTimer.Tick += delegate
            {
                _analysisTimer.Stop();
                if (!_analysisPending) return;
                SetAnalysisPending(false);
                _status.Text = "AI 作答暂无响应";
            };

            _rightLongTimer = new DispatcherTimer();
            _rightLongTimer.Interval = TimeSpan.FromSeconds(2);
            _rightLongTimer.Tick += delegate
            {
                _rightLongTimer.Stop();
                if (!_rightDown || _rightLongTriggered) return;
                _rightLongTriggered = true;
                if (_rightClickTimer != null) _rightClickTimer.Stop();
                _rightClickPending = false;
                TriggerAnalyze(true);
            };

            _rightClickTimer = new DispatcherTimer();
            _rightClickTimer.Interval = TimeSpan.FromMilliseconds(500);
            _rightClickTimer.Tick += delegate
            {
                _rightClickTimer.Stop();
                if (!_rightClickPending) return;
                _rightClickPending = false;
                ToggleAllAnalyses();
            };

            _leftLongTimer = new DispatcherTimer();
            _leftLongTimer.Interval = TimeSpan.FromSeconds(2);
            _leftLongTimer.Tick += delegate
            {
                _leftLongTimer.Stop();
                if (!_leftDown || _leftLongTriggered) return;
                _leftLongTriggered = true;
                if (_longMode)
                {
                    WriteLine("{\"op\":\"screenshot\",\"mode\":\"close\"}");
                }
            };

            _leftClickTimer = new DispatcherTimer();
            _leftClickTimer.Interval = TimeSpan.FromMilliseconds(500);
            _leftClickTimer.Tick += delegate
            {
                _leftClickTimer.Stop();
                if (!_leftClickPending) return;
                _leftClickPending = false;
                if (_longMode) return;
                CaptureFullScreen("quick");
            };

            var reader = new Thread(ReadLoop);
            reader.IsBackground = true;
            reader.Start();

            PaintNow();
            _win.Show();
        }

        private void TriggerAnalyze(bool force)
        {
            if (!force && _analysisPending) return;
            _analysisPending = true;
            if (_analyzeButton != null) _analyzeButton.Content = "作答中…";
            _analysisTimer.Stop();
            _analysisTimer.Start();
            WriteLine("{\"op\":\"analyze\"}");
        }

        private void OnRightDown()
        {
            if (_rightDown) return;
            _rightDown = true;
            _rightLongTriggered = false;
            if (_rightClickPending && _rightClickTimer != null) _rightClickTimer.Stop();
            _rightLongTimer.Stop();
            _rightLongTimer.Start();
        }

        private void OnRightUp()
        {
            if (_rightLongTimer != null) _rightLongTimer.Stop();
            bool wasDown = _rightDown;
            _rightDown = false;
            if (!wasDown) return;
            if (_rightLongTriggered)
            {
                _rightLongTriggered = false;
                _rightClickPending = false;
                return;
            }
            if (_rightClickPending)
            {
                if (_rightClickTimer != null) _rightClickTimer.Stop();
                _rightClickPending = false;
                TriggerAnalyze(true);
                return;
            }
            _rightClickPending = true;
            if (_rightClickTimer != null)
            {
                _rightClickTimer.Stop();
                _rightClickTimer.Start();
            }
        }

        private void OnLeftDown()
        {
            if (_leftDown) return;
            _leftDown = true;
            _leftLongTriggered = false;
            _leftLongTimer.Stop();
            _leftLongTimer.Start();
        }

        private void OnLeftUp()
        {
            if (_leftLongTimer != null) _leftLongTimer.Stop();
            bool wasDown = _leftDown;
            _leftDown = false;
            if (!wasDown) return;
            if (_leftLongTriggered)
            {
                _leftLongTriggered = false;
                return;
            }
            if (_leftClickPending)
            {
                if (_leftClickTimer != null) _leftClickTimer.Stop();
                _leftClickPending = false;
                _longMode = true;
                CaptureFullScreen("analysis");
                return;
            }
            _leftClickPending = true;
            if (_leftClickTimer != null)
            {
                _leftClickTimer.Stop();
                _leftClickTimer.Start();
            }
        }

        private void CancelArrowState()
        {
            if (_rightLongTimer != null) _rightLongTimer.Stop();
            if (_rightClickTimer != null) _rightClickTimer.Stop();
            if (_leftLongTimer != null) _leftLongTimer.Stop();
            if (_leftClickTimer != null) _leftClickTimer.Stop();
            _rightDown = false;
            _rightLongTriggered = false;
            _rightClickPending = false;
            _leftDown = false;
            _leftLongTriggered = false;
            _leftClickPending = false;
        }

        private async void CaptureFullScreen(string mode)
        {
            bool wasVisible = _win.IsVisible;
            try
            {
                if (wasVisible) _win.Hide();
                await Task.Delay(240);
                var bounds = Forms.Screen.PrimaryScreen.Bounds;
                using (var bmp = new Drawing.Bitmap(bounds.Width, bounds.Height))
                {
                    using (var g = Drawing.Graphics.FromImage(bmp))
                    {
                        g.CopyFromScreen(bounds.Location, Drawing.Point.Empty, bounds.Size);
                    }
                    SendScreenshot(mode, bmp);
                }
                _status.Text = "截图已发送，等待 AI…";
            }
            catch (Exception error)
            {
                _status.Text = "截图失败：" + error.Message;
            }
            finally
            {
                if (wasVisible)
                {
                    _win.Show();
                    _win.Activate();
                }
            }
        }

        private void SendScreenshot(string mode, Drawing.Bitmap bitmap)
        {
            using (var stream = new MemoryStream())
            {
                bitmap.Save(stream, DrawingImaging.ImageFormat.Png);
                string image = Convert.ToBase64String(stream.ToArray());
                WriteLine(_json.Serialize(new Dictionary<string, object>
                {
                    { "op", "screenshot" },
                    { "mode", mode },
                    { "image", image }
                }));
            }
        }

        private bool _regionWasVisible;

        private void StartRegionCapture()
        {
            if (_selector != null) return;
            _regionWasVisible = _win.IsVisible;
            if (_regionWasVisible) _win.Hide();
            var win = new Window();
            win.WindowStyle = WindowStyle.None;
            win.AllowsTransparency = true;
            win.Background = new SolidColorBrush(Color.FromArgb(0x55, 0, 0, 0));
            win.Topmost = true;
            win.ShowInTaskbar = false;
            win.WindowStartupLocation = WindowStartupLocation.Manual;
            win.Left = 0;
            win.Top = 0;
            win.Width = SystemParameters.PrimaryScreenWidth;
            win.Height = SystemParameters.PrimaryScreenHeight;
            win.Cursor = Cursors.Cross;
            win.Title = "AI 截图答题";
            var canvas = new Canvas();
            win.Content = canvas;
            var hint = new TextBlock();
            hint.Text = "拖拽框选截图区域 · Esc 取消";
            hint.Foreground = Brushes.White;
            hint.FontSize = 16;
            hint.Background = new SolidColorBrush(Color.FromArgb(0x99, 0, 0, 0));
            hint.Padding = new Thickness(10, 6, 10, 6);
            Canvas.SetLeft(hint, 24);
            Canvas.SetTop(hint, 24);
            canvas.Children.Add(hint);
            var rect = new Border();
            rect.BorderBrush = Brushes.White;
            rect.BorderThickness = new Thickness(1);
            rect.Background = new SolidColorBrush(Color.FromArgb(0x22, 255, 255, 255));
            rect.Visibility = Visibility.Collapsed;
            canvas.Children.Add(rect);
            _selectorRect = rect;
            _selectorStart = new Point();
            _selectorDragging = false;
            win.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                _selectorStart = e.GetPosition(win);
                _selectorDragging = true;
                Canvas.SetLeft(rect, _selectorStart.X);
                Canvas.SetTop(rect, _selectorStart.Y);
                rect.Width = 0;
                rect.Height = 0;
                rect.Visibility = Visibility.Visible;
                win.CaptureMouse();
            };
            win.MouseMove += delegate(object sender, MouseEventArgs e)
            {
                if (!_selectorDragging) return;
                Point point = e.GetPosition(win);
                double x = Math.Min(_selectorStart.X, point.X);
                double y = Math.Min(_selectorStart.Y, point.Y);
                Canvas.SetLeft(rect, x);
                Canvas.SetTop(rect, y);
                rect.Width = Math.Abs(point.X - _selectorStart.X);
                rect.Height = Math.Abs(point.Y - _selectorStart.Y);
            };
            win.MouseLeftButtonUp += delegate(object sender, MouseButtonEventArgs e)
            {
                if (!_selectorDragging) return;
                _selectorDragging = false;
                win.ReleaseMouseCapture();
                Point point = e.GetPosition(win);
                Point a = win.PointToScreen(_selectorStart);
                Point b = win.PointToScreen(point);
                int x1 = (int)Math.Min(a.X, b.X);
                int y1 = (int)Math.Min(a.Y, b.Y);
                int x2 = (int)Math.Max(a.X, b.X);
                int y2 = (int)Math.Max(a.Y, b.Y);
                win.Close();
                _selector = null;
                if (x2 - x1 < 8 || y2 - y1 < 8)
                {
                    RestoreAfterRegion();
                    return;
                }
                var bounds = Forms.Screen.PrimaryScreen.Bounds;
                var capture = new Drawing.Rectangle(
                    Math.Max(bounds.Left, x1),
                    Math.Max(bounds.Top, y1),
                    Math.Min(bounds.Right, x2) - Math.Max(bounds.Left, x1),
                    Math.Min(bounds.Bottom, y2) - Math.Max(bounds.Top, y1));
                if (capture.Width < 8 || capture.Height < 8)
                {
                    RestoreAfterRegion();
                    return;
                }
                _win.Dispatcher.BeginInvoke(new Action(async delegate
                {
                    try
                    {
                        await Task.Delay(140);
                        using (var bmp = new Drawing.Bitmap(capture.Width, capture.Height))
                        {
                            using (var g = Drawing.Graphics.FromImage(bmp))
                            {
                                g.CopyFromScreen(capture.Left, capture.Top, 0, 0, capture.Size);
                            }
                            SendScreenshot("region", bmp);
                        }
                        _status.Text = "截图已发送，等待 AI…";
                    }
                    catch (Exception error)
                    {
                        _status.Text = "截图失败：" + error.Message;
                    }
                    finally
                    {
                        RestoreAfterRegion();
                    }
                }));
            };
            win.KeyDown += delegate(object sender, KeyEventArgs e)
            {
                if (e.Key != Key.Escape) return;
                win.Close();
                _selector = null;
                RestoreAfterRegion();
            };
            win.Closed += delegate
            {
                if (ReferenceEquals(_selector, win)) _selector = null;
            };
            _selector = win;
            win.Show();
            win.Activate();
        }

        private void RestoreAfterRegion()
        {
            _selectorRect = null;
            if (_regionWasVisible && !_win.IsVisible)
            {
                _win.Show();
                _win.Activate();
            }
        }

        private static Button MakeIconButton(string text)        {
            var b = new Button();
            b.Content = text;
            b.FontSize = 11;
            b.Foreground = new SolidColorBrush(Color.FromArgb(0xCC, 255, 255, 255));
            b.Background = Brushes.Transparent;
            b.BorderThickness = new Thickness(0);
            b.Padding = new Thickness(7, 3, 7, 3);
            b.Margin = new Thickness(2, 0, 2, 0);
            b.Cursor = Cursors.Hand;
            b.VerticalAlignment = VerticalAlignment.Center;
            return b;
        }

        private static T FindAncestor<T>(DependencyObject node) where T : DependencyObject
        {
            while (node != null)
            {
                T typed = node as T;
                if (typed != null) return typed;
                node = VisualTreeHelper.GetParent(node);
            }
            return null;
        }

        private static void WriteLine(string text)
        {
            try
            {
                Console.Out.WriteLine(text);
                Console.Out.Flush();
            }
            catch (Exception) { }
        }

        private void ReadLoop()
        {
            try
            {
                var reader = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"read\",\"length\":" + line.Length + "}");
                    string captured = line;
                    _win.Dispatcher.BeginInvoke(new Action(delegate { Handle(captured); }));
                }
            }
            catch (Exception ex)
            {
                if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"reader-error\",\"message\":" + Quote(ex.Message) + "}");
            }
        }

        private static string Quote(string text)
        {
            string s = text == null ? "" : text.Replace("\\", "\\\\").Replace("\"", "\\\"");
            return "\"" + s + "\"";
        }

        private static string S(Dictionary<string, object> d, string key)
        {
            object value;
            if (d != null && d.TryGetValue(key, out value) && value != null) return Convert.ToString(value);
            return null;
        }

        private static double N(Dictionary<string, object> d, string key, double fallback)
        {
            object value;
            if (d != null && d.TryGetValue(key, out value) && value != null)
            {
                double parsed;
                if (double.TryParse(Convert.ToString(value), NumberStyles.Float, CultureInfo.InvariantCulture, out parsed)) return parsed;
            }
            return fallback;
        }

        private static bool B(Dictionary<string, object> d, string key, bool fallback)
        {
            object value;
            if (d != null && d.TryGetValue(key, out value) && value != null)
            {
                bool parsed;
                if (bool.TryParse(Convert.ToString(value), out parsed)) return parsed;
            }
            return fallback;
        }

        private static Dictionary<string, object> D(Dictionary<string, object> d, string key)
        {
            object value;
            if (d != null && d.TryGetValue(key, out value)) return value as Dictionary<string, object>;
            return null;
        }

        private static System.Collections.IEnumerable Enumerate(object value)
        {
            if (value == null || value is string) return null;
            return value as System.Collections.IEnumerable;
        }

        private static List<ExtraCard> ParseExtras(object value)
        {
            var list = new List<ExtraCard>();
            var items = Enumerate(value);
            if (items == null) return list;
            foreach (object entry in items)
            {
                var d = entry as Dictionary<string, object>;
                if (d == null) continue;
                var card = new ExtraCard();
                card.Label = S(d, "label");
                card.Content = S(d, "content");
                card.Tone = S(d, "tone");
                if (!string.IsNullOrEmpty(card.Content)) list.Add(card);
            }
            return list;
        }

        private static List<RubyToken> ParseRuby(object value)
        {
            var list = new List<RubyToken>();
            var items = Enumerate(value);
            if (items == null) return list;
            foreach (object entry in items)
            {
                var d = entry as Dictionary<string, object>;
                if (d == null) continue;
                var token = new RubyToken();
                token.T = S(d, "t");
                token.R = S(d, "r");
                if (string.IsNullOrEmpty(token.T)) continue;
                list.Add(token);
            }
            return list;
        }

        private static List<List<RubyToken>> ParseRubyLines(object value)
        {
            var lines = new List<List<RubyToken>>();
            var outer = Enumerate(value);
            if (outer == null) return lines;
            foreach (object entry in outer)
            {
                var single = entry as Dictionary<string, object>;
                if (single != null)
                {
                    var token = new RubyToken();
                    token.T = S(single, "t");
                    token.R = S(single, "r");
                    if (!string.IsNullOrEmpty(token.T))
                    {
                        var one = new List<RubyToken>();
                        one.Add(token);
                        lines.Add(one);
                    }
                    continue;
                }
                var line = Enumerate(entry);
                if (line == null) continue;
                var tokens = new List<RubyToken>();
                foreach (object tokenEntry in line)
                {
                    var d = tokenEntry as Dictionary<string, object>;
                    if (d == null) continue;
                    var token = new RubyToken();
                    token.T = S(d, "t");
                    token.R = S(d, "r");
                    if (string.IsNullOrEmpty(token.T)) continue;
                    tokens.Add(token);
                }
                lines.Add(tokens);
            }
            return lines;
        }

        private static Color ParseColor(string text, Color fallback)
        {
            if (string.IsNullOrEmpty(text)) return fallback;
            try
            {
                object converted = ColorConverter.ConvertFromString(text);
                if (converted is Color) return (Color)converted;
            }
            catch (Exception) { }
            return fallback;
        }

        private void Handle(string line)
        {
            if (string.IsNullOrEmpty(line)) return;
            Dictionary<string, object> d;
            try { d = _json.Deserialize<Dictionary<string, object>>(line); }
            catch (Exception ex)
            {
                if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"json-error\",\"message\":" + Quote(ex.Message) + "}");
                return;
            }
            if (d == null) return;
            string op = S(d, "op");
            if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"handle\",\"op\":" + Quote(op) + "}");
            if (op == "init") HandleInit(d);
            else if (op == "status") HandleStatus(d);
            else if (op == "item") HandleItem(d);
            else if (op == "update") HandleUpdate(d);
            else if (op == "analysis") HandleAnalysis(d);
            else if (op == "longMode") { _longMode = B(d, "active", false); }
            else if (op == "grouped") { _grouped = B(d, "value", _grouped); _viewButton.Content = _grouped ? "分组" : "时间线"; _dirty = true; PaintNow(); }
            else if (op == "show") { _win.Show(); _win.Topmost = true; _win.Activate(); _win.Focus(); }
            else if (op == "hide") _win.Hide();
            else if (op == "clear") { _items.Clear(); _order.Clear(); _analyses.Clear(); _dirty = true; PaintNow(); }
            else if (op == "close") { _allowClose = true; _win.Close(); Application.Current.Shutdown(); }
        }

        private void HandleInit(Dictionary<string, object> d)
        {
            string title = S(d, "title");
            if (!string.IsNullOrEmpty(title)) { _titleText = title; _title.Text = title; }
            bool hasScreenshot = B(d, "screenshot", false);
            _win.Width = Math.Max(hasScreenshot ? 600 : 360, N(d, "width", _win.Width));
            _win.Height = Math.Max(220, N(d, "height", _win.Height));
            double opacity = N(d, "opacity", _win.Opacity);
            _opacity.Value = Math.Max(0.3, Math.Min(1.0, opacity));
            _grouped = B(d, "grouped", _grouped);
            _viewButton.Content = _grouped ? "分组" : "时间线";
            _analyzeButton.Visibility = B(d, "analyze", false) ? Visibility.Visible : Visibility.Collapsed;
            _longMode = B(d, "longMode", false);
            double left = N(d, "left", double.NaN);
            double top = N(d, "top", double.NaN);
            if (!double.IsNaN(left)) _win.Left = left;
            if (!double.IsNaN(top)) _win.Top = top;
            string status = S(d, "status");
            if (!string.IsNullOrEmpty(status)) _status.Text = status;
            SetAnalysisPending(false);
            _dirty = true;
            PaintNow();
        }

        private double Fs(double baseSize)
        {
            return Math.Max(8.0, baseSize * (_fontSize / 14.0));
        }

        private void AdjustFont(int delta)
        {
            _fontSize = Math.Max(11, Math.Min(24, _fontSize + delta));
            _dirty = true;
            PaintNow();
        }

        private void ToggleAllAnalyses()
        {
            if (_analyses.Count == 0) return;
            _allHidden = !_allHidden;
            if (!_allHidden)
            {
                for (int i = 0; i < _analyses.Count; i++) _analyses[i].Hidden = false;
            }
            _dirty = true;
            PaintNow();
        }

        private void SetAnalysisPending(bool pending)
        {
            _analysisPending = pending;
            if (!pending && _analysisTimer != null) _analysisTimer.Stop();
            if (_analyzeButton != null) _analyzeButton.Content = pending ? "作答中…" : "AI 作答";
        }

        private void HandleStatus(Dictionary<string, object> d)
        {
            string text = S(d, "text");
            if (text != null) _status.Text = text;
            string tone = S(d, "tone");
            if (tone == "error") _status.Foreground = new SolidColorBrush(Color.FromRgb(0xF8, 0x71, 0x71));
            else if (tone == "ok") _status.Foreground = new SolidColorBrush(Color.FromRgb(0x6E, 0xE7, 0xB7));
            else _status.Foreground = new SolidColorBrush(Color.FromArgb(0xB0, 255, 255, 255));
            _status.ToolTip = text;
            if (tone == "error") SetAnalysisPending(false);
            else if (!string.IsNullOrEmpty(text) && (text.Contains("面试作答") || (text.Contains("AI 作答") && !text.Contains("作答中")))) SetAnalysisPending(false);
        }

        private void HandleItem(Dictionary<string, object> d)
        {
            var raw = D(d, "item");
            if (raw == null) return;
            var item = new CaptionItem();
            item.Id = S(raw, "id");
            if (string.IsNullOrEmpty(item.Id)) item.Id = Guid.NewGuid().ToString("N");
            item.SpeakerLabel = S(raw, "speakerLabel");
            if (string.IsNullOrEmpty(item.SpeakerLabel)) item.SpeakerLabel = "说话人";
            item.Language = S(raw, "language");
            item.Time = S(raw, "time");
            item.Text = S(raw, "text");
            item.Translation = S(raw, "translation");
            item.TranslationState = S(raw, "translationState");
            item.Accent = ParseColor(S(raw, "color"), Palette[_items.Count % Palette.Length]);
            object ruby;
            if (raw.TryGetValue("ruby", out ruby))
            {
                if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"ruby-type\",\"type\":\"" + (ruby == null ? "null" : ruby.GetType().FullName) + "\"}");
                item.Ruby = ParseRuby(ruby);
            }
            object extras;
            if (raw.TryGetValue("extras", out extras)) item.Extras = ParseExtras(extras);
            if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"item-ruby\",\"count\":" + item.Ruby.Count + "}");
            if (!_items.ContainsKey(item.Id)) { _order.Add(item.Id); _lastAddedId = item.Id; }
            _items[item.Id] = item;
            _dirty = true;
            PaintNow();
        }

        private void HandleUpdate(Dictionary<string, object> d)
        {
            string id = S(d, "id");
            if (string.IsNullOrEmpty(id)) return;
            CaptionItem item;
            if (!_items.TryGetValue(id, out item)) return;
            var patch = D(d, "patch");
            if (patch != null)
            {
                object translation;
                if (patch.TryGetValue("translation", out translation)) item.Translation = S(patch, "translation");
                if (patch.ContainsKey("translationState")) item.TranslationState = S(patch, "translationState");
                object extras;
                if (patch.TryGetValue("extras", out extras)) item.Extras = ParseExtras(extras);
                object text;
                if (patch.TryGetValue("text", out text)) item.Text = S(patch, "text");
            }
            _dirty = true;
            PaintNow();
        }

        private void HandleAnalysis(Dictionary<string, object> d)
        {
            var card = new AnalysisCard();
            card.Id = S(d, "id");
            card.Label = S(d, "label");
            if (string.IsNullOrEmpty(card.Label)) card.Label = "AI 面试作答";
            card.Content = S(d, "content");
            card.Time = S(d, "time");
            card.Language = S(d, "language");
            card.Translation = S(d, "translation");
            object rubyLines;
            if (d.TryGetValue("rubyLines", out rubyLines))
            {
                if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"ruby-lines-type\",\"type\":\"" + (rubyLines == null ? "null" : rubyLines.GetType().FullName) + "\"}");
                card.RubyLines = ParseRubyLines(rubyLines);
            }
            card.Hidden = B(d, "hidden", false);
            if (!string.IsNullOrEmpty(card.Content)) _analyses.Add(card);
            if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"analysis-ruby\",\"lines\":" + card.RubyLines.Count + "}");
            SetAnalysisPending(false);
            _dirty = true;
            PaintNow();
        }

        private void PaintNow()
        {
            _dirty = false;
            if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"paint\",\"items\":" + _items.Count + ",\"analyses\":" + _analyses.Count + ",\"grouped\":" + (_grouped ? "true" : "false") + "}");
            double offset = _scroll.VerticalOffset;
            bool atBottom = offset >= _scroll.ScrollableHeight - 4;
            _panel.Children.Clear();
            _cards.Clear();
            _groupHeaders.Clear();
            if (_grouped) BuildGrouped(); else BuildTimeline();
            if (_analyses.Count > 0) BuildAnalyses();
            _count.Text = string.Format("已识别 {0} 段", _items.Count);
            _scroll.UpdateLayout();
            Border latest;
            CaptionItem newest;
            if (_lastAddedId != null && _items.TryGetValue(_lastAddedId, out newest))
            {
                if (_cards.TryGetValue(_lastAddedId, out latest))
                {
                    TryScrollTo(latest, 8);
                }
                else if (atBottom) _scroll.ScrollToEnd();
                _lastAddedId = null;
            }
            else if (atBottom) _scroll.ScrollToEnd();
            else _scroll.ScrollToVerticalOffset(offset);
        }

        private void TryScrollTo(FrameworkElement element, double margin)
        {
            try
            {
                var point = element.TransformToAncestor(_scroll).Transform(new Point(0, 0));
                _scroll.ScrollToVerticalOffset(Math.Max(0, point.Y + _scroll.VerticalOffset - margin));
            }
            catch (Exception)
            {
                _scroll.ScrollToEnd();
            }
        }

        private List<string> SpeakersInOrder()
        {
            var seen = new HashSet<string>();
            var list = new List<string>();
            for (int i = 0; i < _order.Count; i++)
            {
                CaptionItem item;
                if (!_items.TryGetValue(_order[i], out item)) continue;
                string key = item.SpeakerLabel;
                if (!seen.Contains(key)) { seen.Add(key); list.Add(key); }
            }
            return list;
        }

        private Color SpeakerColor(string speaker)
        {
            for (int i = 0; i < _order.Count; i++)
            {
                CaptionItem item;
                if (_items.TryGetValue(_order[i], out item) && item.SpeakerLabel == speaker) return item.Accent;
            }
            return Palette[0];
        }

        private void BuildGrouped()
        {
            var speakers = SpeakersInOrder();
            for (int s = 0; s < speakers.Count; s++)
            {
                string speaker = speakers[s];
                Color accent = SpeakerColor(speaker);
                int count = 0;
                for (int i = 0; i < _order.Count; i++)
                {
                    CaptionItem it;
                    if (_items.TryGetValue(_order[i], out it) && it.SpeakerLabel == speaker) count++;
                }
                var head = new Border();
                head.Background = new SolidColorBrush(Color.FromArgb(0x1F, accent.R, accent.G, accent.B));
                head.CornerRadius = new CornerRadius(8);
                head.Padding = new Thickness(9, 5, 9, 5);
                head.Margin = new Thickness(0, 10, 0, 6);
                var headGrid = new Grid();
                headGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(4) });
                headGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                headGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var bar = new Border();
                bar.Width = 4;
                bar.CornerRadius = new CornerRadius(2);
                bar.Background = new SolidColorBrush(accent);
                bar.Margin = new Thickness(0, 1, 8, 1);
                Grid.SetColumn(bar, 0);
                headGrid.Children.Add(bar);
                var label = new TextBlock();
                label.Text = speaker;
                label.Foreground = new SolidColorBrush(accent);
                label.FontWeight = FontWeights.SemiBold;
                label.FontSize = Fs(13);
                label.VerticalAlignment = VerticalAlignment.Center;
                Grid.SetColumn(label, 1);
                headGrid.Children.Add(label);
                var num = new TextBlock();
                num.Text = count + " 段";
                num.Foreground = new SolidColorBrush(Color.FromArgb(0x88, 255, 255, 255));
                num.FontSize = Fs(11);
                num.VerticalAlignment = VerticalAlignment.Center;
                Grid.SetColumn(num, 2);
                headGrid.Children.Add(num);
                head.Child = headGrid;
                _panel.Children.Add(head);
                _groupHeaders[speaker] = head;

                var langs = new List<string>();
                var langSeen = new HashSet<string>();
                for (int i = 0; i < _order.Count; i++)
                {
                    CaptionItem it;
                    if (!_items.TryGetValue(_order[i], out it) || it.SpeakerLabel != speaker) continue;
                    string lk = LangLabel(it.Language);
                    if (!langSeen.Contains(lk)) { langSeen.Add(lk); langs.Add(lk); }
                }
                for (int l = 0; l < langs.Count; l++)
                {
                    string lang = langs[l];
                    if (langs.Count > 1 || true)
                    {
                        var lh = new TextBlock();
                        lh.Text = lang;
                        lh.Foreground = new SolidColorBrush(Color.FromArgb(0x99, 0xC9, 0xD3, 0xE6));
                        lh.FontSize = Fs(11);
                        lh.FontWeight = FontWeights.SemiBold;
                        lh.Margin = new Thickness(2, 6, 0, 4);
                        _panel.Children.Add(lh);
                    }
                    for (int i = 0; i < _order.Count; i++)
                    {
                        CaptionItem it;
                        if (!_items.TryGetValue(_order[i], out it) || it.SpeakerLabel != speaker || LangLabel(it.Language) != lang) continue;
                        _panel.Children.Add(Card(it, true));
                    }
                }
            }
        }

        private void BuildTimeline()
        {
            for (int i = 0; i < _order.Count; i++)
            {
                CaptionItem item;
                if (_items.TryGetValue(_order[i], out item)) _panel.Children.Add(Card(item, true));
            }
        }

        private FrameworkElement BuildRubyLines(List<List<RubyToken>> lines, double fontSize, Brush color)
        {
            if (Program.Debug) WriteLine("{\"op\":\"debug\",\"stage\":\"ruby-render\",\"lines\":" + lines.Count + "}");
            var outer = new StackPanel();
            outer.Margin = new Thickness(0, 4, 0, 0);
            var readingBrush = new SolidColorBrush(Color.FromArgb(0xB8, 164, 196, 238));
            foreach (var line in lines)
            {
                if (line == null || line.Count == 0)
                {
                    var spacer = new TextBlock();
                    spacer.Text = " ";
                    spacer.FontSize = fontSize;
                    outer.Children.Add(spacer);
                    continue;
                }
                var wrap = new WrapPanel();
                wrap.Orientation = Orientation.Horizontal;
                foreach (var token in line)
                {
                    var cell = new StackPanel();
                    cell.Margin = new Thickness(0, 0, 1, 0);
                    var reading = new TextBlock();
                    reading.Text = string.IsNullOrEmpty(token.R) ? " " : token.R;
                    reading.FontSize = Fs(8);
                    reading.Height = Fs(10);
                    reading.Foreground = readingBrush;
                    reading.TextAlignment = TextAlignment.Center;
                    reading.HorizontalAlignment = HorizontalAlignment.Center;
                    cell.Children.Add(reading);
                    var body = new TextBlock();
                    body.Text = token.T;
                    body.FontSize = fontSize;
                    body.Foreground = color;
                    body.TextWrapping = TextWrapping.NoWrap;
                    body.HorizontalAlignment = HorizontalAlignment.Center;
                    cell.Children.Add(body);
                    wrap.Children.Add(cell);
                }
                outer.Children.Add(wrap);
            }
            return outer;
        }

        private void BuildAnalyses()
        {
            var headRow = new Grid();
            headRow.Margin = new Thickness(2, 12, 0, 6);
            headRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var head = new TextBlock();
            head.Text = "✦ AI 面试作答";
            head.Foreground = new SolidColorBrush(Color.FromRgb(0x8F, 0xB4, 0xFF));
            head.FontSize = Fs(12);
            head.FontWeight = FontWeights.SemiBold;
            Grid.SetColumn(head, 0);
            headRow.Children.Add(head);
            if (!_allHidden && _analyses.Count > 0)
            {
                var hideAll = MakeIconButton("全部隐藏");
                hideAll.FontSize = Fs(10);
                hideAll.ToolTip = "隐藏所有 AI 回复（也可单击 →）";
                hideAll.Click += delegate { ToggleAllAnalyses(); };
                Grid.SetColumn(hideAll, 1);
                headRow.Children.Add(hideAll);
            }
            _panel.Children.Add(headRow);
            if (_allHidden)
            {
                var bar = new Border();
                bar.CornerRadius = new CornerRadius(9);
                bar.Background = new SolidColorBrush(Color.FromArgb(0x12, 255, 255, 255));
                bar.BorderBrush = new SolidColorBrush(Color.FromArgb(0x22, 255, 255, 255));
                bar.BorderThickness = new Thickness(1);
                bar.Padding = new Thickness(10, 7, 10, 8);
                bar.Margin = new Thickness(0, 0, 0, 8);
                var row = new Grid();
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var label = new TextBlock();
                label.Text = "AI 回复已全部隐藏";
                label.Foreground = new SolidColorBrush(Color.FromArgb(0x99, 255, 255, 255));
                label.FontSize = Fs(11);
                label.VerticalAlignment = VerticalAlignment.Center;
                Grid.SetColumn(label, 0);
                row.Children.Add(label);
                var showAll = MakeIconButton("显示全部");
                showAll.FontSize = Fs(10);
                showAll.Click += delegate { ToggleAllAnalyses(); };
                Grid.SetColumn(showAll, 1);
                row.Children.Add(showAll);
                bar.Child = row;
                _panel.Children.Add(bar);
                return;
            }
            for (int i = 0; i < _analyses.Count; i++)
            {
                var analysis = _analyses[i];
                var card = new Border();
                card.CornerRadius = new CornerRadius(9);
                card.BorderThickness = new Thickness(1);
                card.Padding = new Thickness(10, 7, 10, 8);
                card.Margin = new Thickness(0, 0, 0, 8);

                if (analysis.Hidden)
                {
                    card.Background = new SolidColorBrush(Color.FromArgb(0x12, 255, 255, 255));
                    card.BorderBrush = new SolidColorBrush(Color.FromArgb(0x22, 255, 255, 255));
                    var hiddenGrid = new Grid();
                    hiddenGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    hiddenGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                    var hiddenLabel = new TextBlock();
                    hiddenLabel.Text = "✦ AI 作答已隐藏（Markdown 笔记中保留）";
                    hiddenLabel.Foreground = new SolidColorBrush(Color.FromArgb(0x99, 255, 255, 255));
                    hiddenLabel.FontSize = Fs(11);
                    hiddenLabel.VerticalAlignment = VerticalAlignment.Center;
                    Grid.SetColumn(hiddenLabel, 0);
                    hiddenGrid.Children.Add(hiddenLabel);
                    var show = MakeIconButton("显示");
                    show.FontSize = Fs(10);
                    show.ToolTip = "重新显示这条 AI 作答";
                    show.Background = new SolidColorBrush(Color.FromArgb(0x1A, 255, 255, 255));
                    show.BorderBrush = new SolidColorBrush(Color.FromArgb(0x33, 255, 255, 255));
                    show.BorderThickness = new Thickness(1);
                    show.Padding = new Thickness(8, 3, 8, 3);
                    show.Click += delegate
                    {
                        analysis.Hidden = false;
                        PaintNow();
                    };
                    Grid.SetColumn(show, 1);
                    hiddenGrid.Children.Add(show);
                    card.Child = hiddenGrid;
                    _panel.Children.Add(card);
                    continue;
                }

                card.Background = new SolidColorBrush(Color.FromArgb(0x22, 0x5B, 0x8D, 0xEF));
                card.BorderBrush = new SolidColorBrush(Color.FromArgb(0x55, 0x5B, 0x8D, 0xEF));
                var stack = new StackPanel();
                var meta = new TextBlock();
                meta.FontSize = Fs(11);
                if (!string.IsNullOrEmpty(analysis.Time))
                {
                    meta.Inlines.Add(new Run(analysis.Time + "  ") { Foreground = new SolidColorBrush(Color.FromArgb(0x88, 255, 255, 255)) });
                }
                meta.Inlines.Add(new Run(analysis.Label) { Foreground = new SolidColorBrush(Color.FromRgb(0x8F, 0xB4, 0xFF)), FontWeight = FontWeights.SemiBold });
                stack.Children.Add(meta);
                var body = new TextBlock();
                body.Text = analysis.Content;
                body.Foreground = Brushes.White;
                body.FontSize = Fs(13);
                body.TextWrapping = TextWrapping.Wrap;
                body.Margin = new Thickness(0, 4, 0, 0);
                if (analysis.RubyLines.Count > 0)
                {
                    stack.Children.Add(BuildRubyLines(analysis.RubyLines, Fs(13), Brushes.White));
                }
                else
                {
                    stack.Children.Add(body);
                }
                if (!string.IsNullOrEmpty(analysis.Translation))
                {
                    var translated = new TextBlock();
                    translated.Text = "译 " + analysis.Translation;
                    translated.Foreground = new SolidColorBrush(Color.FromRgb(0xC5, 0xD5, 0xF0));
                    translated.FontSize = Fs(12);
                    translated.TextWrapping = TextWrapping.Wrap;
                    translated.Margin = new Thickness(0, 6, 0, 0);
                    stack.Children.Add(translated);
                }

                var footer = new Grid();
                footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var hide = MakeIconButton("隐藏");
                hide.FontSize = Fs(10);
                hide.ToolTip = "只在悬浮窗暂时隐藏这条内容；Markdown 笔记里仍然保留";                hide.HorizontalAlignment = HorizontalAlignment.Right;
                hide.Margin = new Thickness(0, 4, 0, 0);
                hide.Background = new SolidColorBrush(Color.FromArgb(0x1A, 255, 255, 255));
                hide.BorderBrush = new SolidColorBrush(Color.FromArgb(0x33, 255, 255, 255));
                hide.BorderThickness = new Thickness(1);
                hide.Padding = new Thickness(8, 3, 8, 3);
                hide.Click += delegate
                {
                    analysis.Hidden = true;
                    PaintNow();
                };
                Grid.SetColumn(hide, 1);
                footer.Children.Add(hide);
                stack.Children.Add(footer);

                card.Child = stack;
                _panel.Children.Add(card);
            }
        }

        private Border Card(CaptionItem item, bool showSpeaker)
        {
            var card = new Border();
            card.CornerRadius = new CornerRadius(9);
            card.Background = new SolidColorBrush(Color.FromArgb(0x22, 255, 255, 255));
            card.BorderBrush = new SolidColorBrush(Color.FromArgb(0x18, 255, 255, 255));
            card.BorderThickness = new Thickness(1);
            card.Padding = new Thickness(10, 7, 10, 8);
            card.Margin = new Thickness(0, 0, 0, 8);

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var accent = new Border();
            accent.Width = 3;
            accent.CornerRadius = new CornerRadius(2);
            accent.Background = new SolidColorBrush(item.Accent);
            accent.Margin = new Thickness(0, 1, 8, 1);
            Grid.SetColumn(accent, 0);
            grid.Children.Add(accent);

            var stack = new StackPanel();
            Grid.SetColumn(stack, 1);

            var meta = new TextBlock();
            meta.FontSize = Fs(11);
            if (!string.IsNullOrEmpty(item.Time))
            {
                meta.Inlines.Add(new Run(item.Time + "  ") { Foreground = new SolidColorBrush(Color.FromArgb(0x88, 255, 255, 255)) });
            }
            if (showSpeaker)
            {
                meta.Inlines.Add(new Run(item.SpeakerLabel) { Foreground = new SolidColorBrush(item.Accent), FontWeight = FontWeights.SemiBold });
                meta.Inlines.Add(new Run("  "));
            }
            meta.Inlines.Add(new Run(LangLabel(item.Language)) { Foreground = new SolidColorBrush(Color.FromArgb(0x77, 255, 255, 255)) });
            stack.Children.Add(meta);

            var text = new TextBlock();
            text.Text = item.Text == null ? "" : item.Text;
            text.Foreground = Brushes.White;
            text.FontSize = Fs(14);
            text.TextWrapping = TextWrapping.Wrap;
            text.Margin = new Thickness(0, 4, 0, 0);
            if (item.Ruby.Count > 0)
            {
                var rubyLines = new List<List<RubyToken>>();
                rubyLines.Add(item.Ruby);
                stack.Children.Add(BuildRubyLines(rubyLines, Fs(14), Brushes.White));
            }
            else
            {
                stack.Children.Add(text);
            }

            string lang = item.Language == null ? "" : item.Language.ToLowerInvariant();
            bool needsTranslation = !(lang == "zh" || lang == "zh-cn" || lang == "zh-tw" || lang == "yue");
            if (!string.IsNullOrEmpty(item.Translation) && item.Translation.Trim().Length > 0)
            {
                var tr = new TextBlock();
                tr.Text = "译  " + item.Translation;
                tr.Foreground = new SolidColorBrush(Color.FromRgb(0xC9, 0xD7, 0xF2));
                tr.FontSize = Fs(13);
                tr.TextWrapping = TextWrapping.Wrap;
                tr.Margin = new Thickness(0, 4, 0, 0);
                stack.Children.Add(tr);
            }
            else if (needsTranslation && item.TranslationState == "pending")
            {
                var pending = new TextBlock();
                pending.Text = "翻译中…";
                pending.Foreground = new SolidColorBrush(Color.FromArgb(0x77, 255, 255, 255));
                pending.FontSize = Fs(12);
                pending.Margin = new Thickness(0, 4, 0, 0);
                stack.Children.Add(pending);
            }
            else if (needsTranslation && item.TranslationState == "failed")
            {
                var failed = new TextBlock();
                failed.Text = "翻译暂不可用";
                failed.Foreground = new SolidColorBrush(Color.FromRgb(0xF8, 0xB4, 0x71));
                failed.FontSize = Fs(12);
                failed.Margin = new Thickness(0, 4, 0, 0);
                stack.Children.Add(failed);
            }

            for (int i = 0; i < item.Extras.Count; i++)
            {
                var extra = item.Extras[i];
                var box = new Border();
                box.CornerRadius = new CornerRadius(7);
                box.Padding = new Thickness(9, 5, 9, 6);
                box.Margin = new Thickness(0, 6, 0, 0);
                if (extra.Tone == "ai")
                {
                    box.Background = new SolidColorBrush(Color.FromArgb(0x1F, 0x8F, 0xB4, 0xFF));
                    box.BorderBrush = new SolidColorBrush(Color.FromArgb(0x44, 0x5B, 0x8D, 0xEF));
                }
                else if (extra.Tone == "warn")
                {
                    box.Background = new SolidColorBrush(Color.FromArgb(0x1F, 0xF5, 0x9E, 0x0B));
                    box.BorderBrush = new SolidColorBrush(Color.FromArgb(0x44, 0xF5, 0x9E, 0x0B));
                }
                else
                {
                    box.Background = new SolidColorBrush(Color.FromArgb(0x14, 0xFF, 0xFF, 0xFF));
                    box.BorderBrush = new SolidColorBrush(Color.FromArgb(0x22, 0xFF, 0xFF, 0xFF));
                }
                box.BorderThickness = new Thickness(1);
                var es = new StackPanel();
                var el = new TextBlock();
                el.Text = "✦ " + (extra.Label == null ? "扩展" : extra.Label);
                el.FontSize = Fs(10);
                el.FontWeight = FontWeights.SemiBold;
                el.Foreground = new SolidColorBrush(Color.FromRgb(0x9D, 0xBC, 0xFF));
                es.Children.Add(el);
                var ec = new TextBlock();
                ec.Text = extra.Content;
                ec.FontSize = Fs(12);
                ec.Foreground = Brushes.White;
                ec.TextWrapping = TextWrapping.Wrap;
                ec.Margin = new Thickness(0, 3, 0, 0);
                es.Children.Add(ec);
                box.Child = es;
                stack.Children.Add(box);
            }

            grid.Children.Add(stack);
            card.Child = grid;
            _cards[item.Id] = card;
            return card;
        }

        private static string LangLabel(string code)
        {
            if (string.IsNullOrEmpty(code)) return "未知";
            switch (code.ToLowerInvariant())
            {
                case "zh":
                case "zh-cn":
                case "zh-tw":
                    return "中文";
                case "en": return "English";
                case "ja": return "日本語";
                case "ko": return "한국어";
                case "fr": return "Français";
                case "de": return "Deutsch";
                case "es": return "Español";
                case "ru": return "Русский";
                case "yue": return "粤语";
                default: return code.ToUpperInvariant();
            }
        }
    }
}

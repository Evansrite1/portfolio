// Presenter Setup by Evans Large.
// A friendly front door for the real installer: it shows the welcome, runs files\Presenter-Installer.exe quietly, and shows progress.
// Plain C# 5 on .NET Framework 4.x, which every Windows 10 and 11 computer already has, so nothing extra is downloaded.
// Test it without installing anything:  "Presenter Setup.exe" --demo
// Save a picture of a screen:           "Presenter Setup.exe" --snapshot welcome|install|done|error out.png
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using Rectangle = System.Windows.Shapes.Rectangle;
using System.Windows.Threading;

[assembly: AssemblyTitle("Presenter Setup")]
[assembly: AssemblyProduct("Presenter by Evans Large")]
[assembly: AssemblyCompany("Evans Large")]

namespace EvansLarge.PresenterSetup
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            Application app = new Application();
            app.ShutdownMode = ShutdownMode.OnMainWindowClose;
            return app.Run(new SetupWindow(args));
        }
    }

    class SetupWindow : Window
    {
        const double W = 880, H = 550;
        const long ExpectedBytes = 330L * 1024 * 1024;
        static readonly string[] Tips = new string[] {
            "Double tap a song to put its words on the screen.",
            "Type a book, press Tab, type the chapter, press Tab, type the verse, press Enter.",
            "Split screen shows two verses or two pictures side by side.",
            "Twenty two themes are waiting. Try Space or Sunrise.",
            "Press Listen and Presenter finds the verses your speaker reads.",
            "Videos loop by themselves. Use the back and forward buttons to jump."
        };
        static readonly string[] Steps = new string[] { "Unpacking the program", "Setting up the second screen", "Adding songs and Bible versions", "Creating shortcuts", "Finishing up" };
        static readonly string[][] Shots = new string[][] {
            new string[] { "webb-carina.jpg", "Cosmic Cliffs, James Webb Space Telescope. NASA, ESA, CSA, STScI. Public domain" },
            new string[] { "aurora.jpg", "Aurora Australis seen from orbit. NASA. Public domain" },
            new string[] { "hubble-pillars.jpg", "Pillars of Creation, Hubble. NASA, ESA, STScI. Public domain" },
            new string[] { "orbital-sunrise.jpg", "An orbital sunrise over Earth. NASA, International Space Station. Public domain" },
            new string[] { "m83-galaxy.jpg", "Spiral galaxy M83. NASA, ESA, Hubble. Public domain" }
        };

        readonly bool demo;
        readonly string[] args;
        Grid welcome, install, done, error, current;
        Border root, fill;
        TextBlock tip, stepText, pctText, credit, errText;
        readonly List<Image> slideImgs = new List<Image>();
        int slideIdx = -1, tipIdx = 0;
        bool desktopShortcut = true, openAfter = true, installing = false;
        double progress = 0;
        DateTime started;
        Process proc;
        string installDir, exePath;
        DispatcherTimer tick, slideTimer, tipTimer;

        public SetupWindow(string[] a)
        {
            args = a;
            demo = Array.IndexOf(a, "--demo") >= 0;
            WindowStyle = WindowStyle.None; AllowsTransparency = true; Background = Brushes.Transparent;
            Width = W + 40; Height = H + 40; ResizeMode = ResizeMode.NoResize; WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Title = "Presenter Setup"; UseLayoutRounding = true; SnapsToDevicePixels = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
            try { Icon = Img("icon.png"); } catch (Exception) { }
            string local = Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "";
            installDir = Environment.GetEnvironmentVariable("SETUP_INSTALLDIR") ?? Path.Combine(local, "Programs", "Presenter by Evans Large"); /* the variable is only for testing */
            exePath = Path.Combine(installDir, "Presenter by Evans Large.exe");

            root = new Border { Width = W, Height = H, CornerRadius = new CornerRadius(14), Background = B("#10101A"), BorderBrush = B("#2C2A40"), BorderThickness = new Thickness(1) };
            root.Effect = new DropShadowEffect { BlurRadius = 36, ShadowDepth = 8, Opacity = 0.6, Color = Colors.Black };
            Grid host = new Grid();
            root.Child = host;
            root.SizeChanged += delegate { host.Clip = new RectangleGeometry(new Rect(0, 0, root.ActualWidth, root.ActualHeight), 13, 13); };
            Content = root;

            welcome = BuildWelcome(); install = BuildInstall(); done = BuildDone(); error = BuildError();
            foreach (Grid g in new Grid[] { welcome, install, done, error }) { g.Opacity = 0; g.Visibility = Visibility.Collapsed; host.Children.Add(g); }
            host.Children.Add(BuildChrome());
            MouseLeftButtonDown += delegate(object s, MouseButtonEventArgs e) { try { if (!(e.OriginalSource is TextBlock && ((TextBlock)e.OriginalSource).Cursor == Cursors.Hand)) DragMove(); } catch (Exception) { } };

            Loaded += delegate { OnLoaded(); };
        }

        void OnLoaded()
        {
            int snap = Array.IndexOf(args, "--snapshot");
            if (snap >= 0 && args.Length > snap + 2)
            {
                string which = args[snap + 1], outPath = args[snap + 2];
                if (which == "install") { StartSlides(); progress = 0.56; SetProgress(progress, false); stepText.Text = Steps[2]; pctText.Text = "56%"; Show(install); }
                else if (which == "done") Show(done);
                else if (which == "error") { errText.Text = "Setup could not finish. The installer returned an error."; Show(error); }
                else Show(welcome);
                DispatcherTimer t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(2600) };
                t.Tick += delegate { t.Stop(); Snapshot(outPath); Application.Current.Shutdown(); };
                t.Start();
                return;
            }
            Show(welcome);
            if (Array.IndexOf(args, "--autostart") >= 0) BeginInstall();
        }

        void Log(string m) { try { string p = Environment.GetEnvironmentVariable("SETUP_LOG"); if (!string.IsNullOrEmpty(p)) File.AppendAllText(p, DateTime.Now.ToString("HH:mm:ss") + " " + m + Environment.NewLine); } catch (Exception) { } }

        void Snapshot(string path)
        {
            root.UpdateLayout();
            RenderTargetBitmap rtb = new RenderTargetBitmap((int)W, (int)H, 96, 96, PixelFormats.Pbgra32);
            DrawingVisual dv = new DrawingVisual();
            using (DrawingContext dc = dv.RenderOpen()) { dc.DrawRectangle(new VisualBrush(root), null, new Rect(0, 0, W, H)); }
            rtb.Render(dv);
            PngBitmapEncoder enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(rtb));
            using (FileStream fs = File.Create(path)) enc.Save(fs);
        }

        // ---------------------------------------------------------------- helpers
        static Brush B(string hex) { return (Brush)new BrushConverter().ConvertFromString(hex); }

        static BitmapImage Img(string name)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            foreach (string n in asm.GetManifestResourceNames())
            {
                if (n.EndsWith(name, StringComparison.OrdinalIgnoreCase))
                {
                    BitmapImage bi = new BitmapImage();
                    bi.BeginInit(); bi.CacheOption = BitmapCacheOption.OnLoad; bi.StreamSource = asm.GetManifestResourceStream(n); bi.EndInit(); bi.Freeze();
                    return bi;
                }
            }
            throw new FileNotFoundException(name);
        }

        static TextBlock Text(string s, double size, string color, FontWeight? weight)
        {
            TextBlock t = new TextBlock { Text = s, FontSize = size, Foreground = B(color), TextWrapping = TextWrapping.Wrap, FontFamily = new FontFamily("Segoe UI") };
            if (weight.HasValue) t.FontWeight = weight.Value;
            return t;
        }

        FrameworkElement Button(string label, bool primary, RoutedEventHandler onClick)
        {
            Border b = new Border { CornerRadius = new CornerRadius(11), Padding = new Thickness(22, 12, 22, 12), Cursor = Cursors.Hand, Margin = new Thickness(0, 0, 10, 0) };
            TextBlock t = Text(label, 14.5, primary ? "#1A0A09" : "#C9C4D6", FontWeights.Bold);
            b.Child = t;
            if (primary)
            {
                b.Background = new LinearGradientBrush(Color.FromRgb(0xFF, 0x7A, 0x5C), Color.FromRgb(0xFF, 0x5B, 0x52), 45);
                b.Effect = new DropShadowEffect { BlurRadius = 24, ShadowDepth = 6, Opacity = 0.35, Color = Color.FromRgb(0xFF, 0x5B, 0x52) };
            }
            else { b.BorderBrush = B("#3A3850"); b.BorderThickness = new Thickness(1); b.Background = Brushes.Transparent; }
            b.MouseEnter += delegate { b.Opacity = 0.9; };
            b.MouseLeave += delegate { b.Opacity = 1; };
            b.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e) { onClick(s, e); };
            return b;
        }

        FrameworkElement Check(string label, bool on, Action<bool> changed)
        {
            StackPanel row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 4), Cursor = Cursors.Hand };
            Border box = new Border { Width = 19, Height = 19, CornerRadius = new CornerRadius(5), VerticalAlignment = VerticalAlignment.Center };
            TextBlock tick = new TextBlock { Text = "✓", FontSize = 13, FontWeight = FontWeights.Bold, Foreground = B("#1A0A09"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            box.Child = tick;
            Action paint = delegate { box.Background = on ? B("#FF5B52") : B("#1C1A2E"); box.BorderBrush = on ? B("#FF5B52") : B("#4A4760"); box.BorderThickness = new Thickness(1); tick.Visibility = on ? Visibility.Visible : Visibility.Collapsed; };
            paint();
            row.Children.Add(box);
            TextBlock t = Text(label, 14, "#C9C4D6", null); t.Margin = new Thickness(11, 0, 0, 0); t.VerticalAlignment = VerticalAlignment.Center;
            row.Children.Add(t);
            row.MouseLeftButtonUp += delegate { on = !on; paint(); changed(on); };
            return row;
        }

        Grid PaperCard(bool bigSketch)
        {
            Grid g = new Grid { Background = B("#F4EEE0"), ClipToBounds = true };
            Image sk = new Image { Source = Img("portrait-sketch.png"), Stretch = Stretch.UniformToFill, VerticalAlignment = VerticalAlignment.Top, HorizontalAlignment = HorizontalAlignment.Center };
            g.Children.Add(sk);
            LinearGradientBrush fade = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            fade.GradientStops.Add(new GradientStop(Color.FromArgb(0, 244, 238, 224), 0.72));
            fade.GradientStops.Add(new GradientStop(Color.FromArgb(235, 244, 238, 224), 1));
            g.Children.Add(new Rectangle { Fill = fade, IsHitTestVisible = false });
            Image sig = new Image { Source = Img("signature-dark.png"), Stretch = Stretch.Uniform, Width = 190, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(30, 0, 0, 30) };
            sig.RenderTransform = new RotateTransform(-3);
            g.Children.Add(sig);
            TextBlock made = Text("MADE BY", 10.5, "#6B6478", FontWeights.SemiBold); made.HorizontalAlignment = HorizontalAlignment.Right; made.VerticalAlignment = VerticalAlignment.Bottom; made.Margin = new Thickness(0, 0, 26, 32);
            g.Children.Add(made);
            return g;
        }

        Grid TwoColumns(Grid left, StackPanel right)
        {
            Grid g = new Grid();
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(42, GridUnitType.Star) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(58, GridUnitType.Star) });
            Grid.SetColumn(left, 0); g.Children.Add(left);
            Border rb = new Border { Background = new LinearGradientBrush(Color.FromRgb(0x17, 0x14, 0x2B), Color.FromRgb(0x0E, 0x0E, 0x18), 70), Padding = new Thickness(44, 64, 44, 34) };
            rb.Child = right; Grid.SetColumn(rb, 1); g.Children.Add(rb);
            return g;
        }

        FrameworkElement BuildChrome()
        {
            StackPanel p = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 6, 8, 0) };
            Func<string, RoutedEventHandler, TextBlock> mk = delegate(string glyph, RoutedEventHandler h)
            {
                TextBlock t = new TextBlock { Text = glyph, FontSize = 16, Foreground = B("#C9C4D6"), Padding = new Thickness(10, 4, 10, 4), Cursor = Cursors.Hand };
                t.MouseEnter += delegate { t.Foreground = Brushes.White; }; t.MouseLeave += delegate { t.Foreground = B("#C9C4D6"); };
                t.MouseLeftButtonUp += delegate(object s, MouseButtonEventArgs e) { h(s, e); e.Handled = true; };
                return t;
            };
            p.Children.Add(mk("–", delegate { WindowState = WindowState.Minimized; }));
            p.Children.Add(mk("✕", delegate { if (!installing) Close(); }));
            TextBlock title = Text("Presenter Setup", 12, "#C9C4D6", null); title.Margin = new Thickness(16, 11, 0, 0); title.VerticalAlignment = VerticalAlignment.Top; title.HorizontalAlignment = HorizontalAlignment.Left; title.IsHitTestVisible = false;
            Grid g = new Grid(); g.Children.Add(title); g.Children.Add(p);
            g.VerticalAlignment = VerticalAlignment.Top; g.Height = 40;
            return g;
        }

        // ---------------------------------------------------------------- screens
        Grid BuildWelcome()
        {
            StackPanel r = new StackPanel();
            TextBlock h = new TextBlock { FontSize = 36, FontWeight = FontWeights.Bold, Foreground = B("#F3EFE6"), FontFamily = new FontFamily("Segoe UI"), TextWrapping = TextWrapping.Wrap };
            h.Inlines.Add(new System.Windows.Documents.Run("Welcome to "));
            h.Inlines.Add(new System.Windows.Documents.Run("Presenter") { Foreground = B("#FF5B52") });
            r.Children.Add(h);
            TextBlock d = Text("Songs, scripture, media and a second screen for your church, school or event. Ready in about two minutes.", 15, "#C9C4D6", null); d.Margin = new Thickness(0, 12, 0, 16);
            r.Children.Add(d);
            r.Children.Add(Check("Put a shortcut on the desktop", true, delegate(bool v) { desktopShortcut = v; }));
            r.Children.Add(Check("Open Presenter when setup finishes", true, delegate(bool v) { openAfter = v; }));
            Border info = new Border { Margin = new Thickness(0, 16, 0, 0), Padding = new Thickness(12, 9, 12, 9), CornerRadius = new CornerRadius(9), BorderBrush = B("#2C2A40"), BorderThickness = new Thickness(1), Background = B("#12111F") };
            info.Child = Text("Installs for you only, in your own user folder. No administrator password needed. Presenter is added to the Start menu.", 12.5, "#8C88A0", null);
            r.Children.Add(info);
            Grid shell = new Grid();
            shell.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            shell.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            r.VerticalAlignment = VerticalAlignment.Top;
            StackPanel bottom = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 0) };
            bottom.Children.Add(Button("Install Presenter", true, delegate { BeginInstall(); }));
            TextBlock size = Text("About 310 MB", 12.5, "#8C88A0", null); size.VerticalAlignment = VerticalAlignment.Center;
            bottom.Children.Add(size);
            Grid.SetRow(r, 0); Grid.SetRow(bottom, 1); shell.Children.Add(r); shell.Children.Add(bottom);
            Grid g = new Grid();
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(42, GridUnitType.Star) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(58, GridUnitType.Star) });
            Grid left = PaperCard(false); Grid.SetColumn(left, 0); g.Children.Add(left);
            Border rb = new Border { Background = new LinearGradientBrush(Color.FromRgb(0x17, 0x14, 0x2B), Color.FromRgb(0x0E, 0x0E, 0x18), 70), Padding = new Thickness(44, 60, 44, 34) };
            rb.Child = shell; Grid.SetColumn(rb, 1); g.Children.Add(rb);
            return g;
        }

        Grid BuildInstall()
        {
            Grid g = new Grid { Background = Brushes.Black };
            Grid slides = new Grid { ClipToBounds = true };
            foreach (string[] s in Shots)
            {
                Image im = new Image { Source = Img(s[0]), Stretch = Stretch.UniformToFill, Opacity = 0, RenderTransformOrigin = new Point(0.5, 0.5) };
                im.RenderTransform = new ScaleTransform(1.04, 1.04);
                slides.Children.Add(im); slideImgs.Add(im);
            }
            g.Children.Add(slides);
            LinearGradientBrush shade = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            shade.GradientStops.Add(new GradientStop(Color.FromArgb(115, 0, 0, 0), 0));
            shade.GradientStops.Add(new GradientStop(Color.FromArgb(0, 0, 0, 0), 0.26));
            shade.GradientStops.Add(new GradientStop(Color.FromArgb(0, 0, 0, 0), 0.52));
            shade.GradientStops.Add(new GradientStop(Color.FromArgb(210, 0, 0, 0), 1));
            g.Children.Add(new Rectangle { Fill = shade, IsHitTestVisible = false });

            Grid top = new Grid { Margin = new Thickness(34, 54, 34, 0), VerticalAlignment = VerticalAlignment.Top };
            StackPanel brand = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Left };
            Image ic = new Image { Source = Img("icon.png"), Width = 46, Height = 46 };
            brand.Children.Add(ic);
            StackPanel bt = new StackPanel { Margin = new Thickness(12, 2, 0, 0) };
            bt.Children.Add(Text("Installing Presenter", 20, "#FFFFFF", FontWeights.Bold));
            bt.Children.Add(Text("Please keep this window open", 12.5, "#C9C4D6", null));
            brand.Children.Add(bt);
            top.Children.Add(brand);
            Border badge = new Border { Width = 84, Height = 84, CornerRadius = new CornerRadius(42), Background = B("#F4EEE0"), BorderBrush = new SolidColorBrush(Color.FromArgb(230, 255, 255, 255)), BorderThickness = new Thickness(3), HorizontalAlignment = HorizontalAlignment.Right, ClipToBounds = true };
            Image bi = new Image { Source = Img("portrait-face.png"), Stretch = Stretch.UniformToFill };
            badge.Child = bi;
            badge.Clip = new EllipseGeometry(new Point(42, 42), 40, 40);
            top.Children.Add(badge);
            g.Children.Add(top);

            credit = Text("", 10.5, "#D8D5E4", null); credit.HorizontalAlignment = HorizontalAlignment.Left; credit.VerticalAlignment = VerticalAlignment.Top; credit.Margin = new Thickness(34, 128, 0, 0); credit.MaxWidth = 460; credit.Effect = new DropShadowEffect { BlurRadius = 8, ShadowDepth = 1, Opacity = 0.9 };
            g.Children.Add(credit);

            StackPanel bottom = new StackPanel { VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(34, 0, 34, 26) };
            tip = Text("", 18, "#FFFFFF", FontWeights.SemiBold); tip.MinHeight = 52; tip.MaxWidth = 640; tip.HorizontalAlignment = HorizontalAlignment.Left; tip.Effect = new DropShadowEffect { BlurRadius = 10, ShadowDepth = 1, Opacity = 0.8 };
            bottom.Children.Add(tip);
            Grid track = new Grid { Height = 8, Margin = new Thickness(0, 14, 0, 8) };
            track.Children.Add(new Border { CornerRadius = new CornerRadius(4), Background = new SolidColorBrush(Color.FromArgb(46, 255, 255, 255)) });
            fill = new Border { CornerRadius = new CornerRadius(4), Width = 0, HorizontalAlignment = HorizontalAlignment.Left, Background = new LinearGradientBrush(Color.FromRgb(0xF2, 0xB1, 0x34), Color.FromRgb(0xFF, 0x5B, 0x52), 0) };
            track.Children.Add(fill);
            bottom.Children.Add(track);
            Grid meta = new Grid();
            stepText = Text("Getting ready", 12.5, "#C9C4D6", null);
            pctText = Text("0%", 12.5, "#C9C4D6", null); pctText.HorizontalAlignment = HorizontalAlignment.Right;
            meta.Children.Add(stepText); meta.Children.Add(pctText);
            bottom.Children.Add(meta);
            g.Children.Add(bottom);
            return g;
        }

        Grid BuildDone()
        {
            StackPanel r = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            Border check = new Border { Width = 54, Height = 54, CornerRadius = new CornerRadius(27), Background = B("#F2B134"), HorizontalAlignment = HorizontalAlignment.Left };
            check.Child = new TextBlock { Text = "✓", FontSize = 28, FontWeight = FontWeights.Bold, Foreground = B("#2B1A05"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            r.Children.Add(check);
            TextBlock h = Text("You are all set", 34, "#F3EFE6", FontWeights.Bold); h.Margin = new Thickness(0, 16, 0, 10);
            r.Children.Add(h);
            r.Children.Add(Text("Presenter is installed. Connect your TV or projector and choose your screen inside the app. Updates arrive on their own when you are online.", 15, "#C9C4D6", null));
            StackPanel btns = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 28, 0, 0) };
            btns.Children.Add(Button("Open Presenter", true, delegate { LaunchApp(); Close(); }));
            btns.Children.Add(Button("Close", false, delegate { Close(); }));
            r.Children.Add(btns);
            return TwoColumns(PaperCard(false), r);
        }

        Grid BuildError()
        {
            StackPanel r = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            r.Children.Add(Text("Setup needs a hand", 32, "#F3EFE6", FontWeights.Bold));
            errText = Text("", 14.5, "#FF9D96", null); errText.Margin = new Thickness(0, 12, 0, 8);
            r.Children.Add(errText);
            r.Children.Add(Text("You can still install Presenter by hand: open the \"files\" folder next to this setup and double click Presenter-Installer.exe. If Windows asks, choose More info, then Run anyway.", 14, "#C9C4D6", null));
            StackPanel btns = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 26, 0, 0) };
            btns.Children.Add(Button("Open the files folder", true, delegate { OpenFiles(); }));
            btns.Children.Add(Button("Close", false, delegate { Close(); }));
            r.Children.Add(btns);
            return TwoColumns(PaperCard(false), r);
        }

        // ---------------------------------------------------------------- moving between screens
        void Show(Grid next)
        {
            if (current == next) return;
            Grid old = current; current = next;
            next.Visibility = Visibility.Visible;
            next.BeginAnimation(OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(500)));
            if (old != null)
            {
                DoubleAnimation fo = new DoubleAnimation(0, TimeSpan.FromMilliseconds(500));
                fo.Completed += delegate { if (current != old) old.Visibility = Visibility.Collapsed; };
                old.BeginAnimation(OpacityProperty, fo);
            }
        }

        void StartSlides()
        {
            NextSlide(); NextTip();
            if (slideTimer == null)
            {
                slideTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(4500) }; slideTimer.Tick += delegate { NextSlide(); }; slideTimer.Start();
                tipTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(5200) }; tipTimer.Tick += delegate { NextTip(); }; tipTimer.Start();
            }
        }

        void NextSlide()
        {
            int prev = slideIdx; slideIdx = (slideIdx + 1) % slideImgs.Count;
            Image cur = slideImgs[slideIdx];
            cur.BeginAnimation(OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(1600)));
            ScaleTransform st = (ScaleTransform)cur.RenderTransform;
            DoubleAnimation zoom = new DoubleAnimation(1.04, 1.14, TimeSpan.FromSeconds(9));
            st.BeginAnimation(ScaleTransform.ScaleXProperty, zoom); st.BeginAnimation(ScaleTransform.ScaleYProperty, zoom);
            if (prev >= 0) slideImgs[prev].BeginAnimation(OpacityProperty, new DoubleAnimation(0, TimeSpan.FromMilliseconds(1600)));
            credit.Text = Shots[slideIdx][1];
        }

        void NextTip()
        {
            DoubleAnimation fo = new DoubleAnimation(0, TimeSpan.FromMilliseconds(350));
            fo.Completed += delegate { tip.Text = Tips[tipIdx++ % Tips.Length]; tip.BeginAnimation(OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(450))); };
            tip.BeginAnimation(OpacityProperty, fo);
        }

        void SetProgress(double p, bool animate)
        {
            double target = Math.Max(0, Math.Min(1, p)) * (W - 68);
            if (animate) fill.BeginAnimation(WidthProperty, new DoubleAnimation(target, TimeSpan.FromMilliseconds(380))); else { fill.BeginAnimation(WidthProperty, null); fill.Width = target; }
            pctText.Text = ((int)Math.Round(p * 100)) + "%";
            stepText.Text = Steps[Math.Min(Steps.Length - 1, (int)(p * 100 / 21))];
        }

        // ---------------------------------------------------------------- the install itself
        static long FolderSize(string dir)
        {
            long n = 0;
            try { foreach (string f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)) { try { n += new FileInfo(f).Length; } catch (Exception) { } } } catch (Exception) { }
            return n;
        }

        string FilesDir() { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "files"); }
        void OpenFiles() { try { Process.Start("explorer.exe", "\"" + FilesDir() + "\""); } catch (Exception) { } }
        void LaunchApp() { try { if (File.Exists(exePath)) Process.Start(exePath); } catch (Exception) { } }

        void BeginInstall()
        {
            if (installing) return;
            string setup = Path.Combine(FilesDir(), "Presenter-Installer.exe");
            if (!demo && !File.Exists(setup))
            {
                errText.Text = "The installer file is missing. Unzip the whole download first, then open Presenter Setup from the unzipped folder.";
                Show(error); return;
            }
            installing = true; started = DateTime.UtcNow; progress = 0;
            StartSlides(); SetProgress(0, false); Show(install);
            long baseline = Directory.Exists(installDir) ? FolderSize(installDir) : 0;
            if (!demo)
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(setup, "/S") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = FilesDir() };
                    proc = Process.Start(psi); Log("installer started: " + setup);
                }
                catch (Exception ex) { installing = false; errText.Text = "Setup could not start the installer. " + ex.Message; Show(error); return; }
            }
            tick = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(450) };
            tick.Tick += delegate
            {
                double secs = (DateTime.UtcNow - started).TotalSeconds;
                double byTime = 0.93 * (1 - Math.Exp(-secs / (demo ? 9.0 : 45.0)));
                double bySize = 0;
                bool finished = false; int code = 0;
                if (demo) { if (secs > 26) finished = true; }
                else
                {
                    long now = Directory.Exists(installDir) ? FolderSize(installDir) : 0;
                    bySize = Math.Max(0, (double)(now - baseline)) / ExpectedBytes * 0.95;
                    if (proc != null && proc.HasExited) { finished = true; code = proc.ExitCode; }
                }
                double p = Math.Max(progress, Math.Min(0.96, Math.Max(byTime, bySize)));
                if (finished)
                {
                    tick.Stop(); installing = false; Log("installer finished with code " + code);
                    if (code != 0) { errText.Text = "The installer stopped with code " + code + ". Close Presenter if it is open, then try again."; Show(error); return; }
                    progress = 1; SetProgress(1, true); stepText.Text = "All done";
                    AfterInstall();
                    DispatcherTimer t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1000) };
                    t.Tick += delegate { t.Stop(); Show(done); Log("done screen shown"); if (openAfter && !demo) { LaunchApp(); } };
                    t.Start();
                    return;
                }
                progress = p; SetProgress(p, true);
            };
            tick.Start();
        }

        void AfterInstall()
        {
            if (desktopShortcut || demo) return;
            try
            {
                string desk = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                foreach (string f in Directory.GetFiles(desk, "Presenter by Evans Large*.lnk")) File.Delete(f);
            }
            catch (Exception) { }
        }
    }
}
